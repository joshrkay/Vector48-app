import { NextResponse } from "next/server";

import { requireAccountForUser } from "@/lib/auth/account";
import { cachedGHLClient } from "@/lib/ghl/cache";
import { inferGhlCachedAtIso } from "@/lib/ghl/cacheMeta";
import { getTierConfig } from "@/lib/ghl/tierConfig";
import { getAccountGhlCredentials } from "@/lib/ghl/token";
import type { CachedGHLClient } from "@/lib/ghl/cache";
import type { GHLClientOptions } from "@/lib/ghl/client";
import { createServerClient } from "@/lib/supabase/server";

type GHLSummaryResponse = {
  openLeads: number;
  conversationsToday: number;
  totalContacts: number;
  unreadInbox: number;
  isStub: boolean;
  cachedAt: string;
};

function stubSummary(cachedAt: string): GHLSummaryResponse {
  return {
    openLeads: 0,
    conversationsToday: 0,
    totalContacts: 0,
    unreadInbox: 0,
    isStub: true,
    cachedAt,
  };
}

function getUtcMidnightUnix(): number {
  const now = new Date();
  return Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000,
  );
}

async function getOpenLeads(
  client: CachedGHLClient,
  opts: GHLClientOptions,
): Promise<number> {
  const [newLeadResponse, contactedResponse] = await Promise.all([
    client.getContacts(
      {
        locationId: opts.locationId,
        limit: 1,
        tag: "New Lead",
      },
      opts,
    ),
    client.getContacts(
      {
        locationId: opts.locationId,
        limit: 1,
        tag: "Contacted",
      },
      opts,
    ),
  ]);

  return (newLeadResponse.meta?.total ?? 0) + (contactedResponse.meta?.total ?? 0);
}

async function getConversationsToday(
  client: CachedGHLClient,
  opts: GHLClientOptions,
): Promise<number> {
  const startAfter = getUtcMidnightUnix();
  const todayStartMs = startAfter * 1000;

  const response = await client.getConversations(
    {
      locationId: opts.locationId,
      limit: 1,
      startAfter,
      sort: "desc",
      sortBy: "last_message_date",
    },
    opts,
  );

  if (typeof response.meta?.total === "number") {
    return response.meta.total;
  }

  return response.conversations.filter((conversation) => {
    if (!conversation.lastMessageDate) return false;
    return new Date(conversation.lastMessageDate).getTime() >= todayStartMs;
  }).length;
}

async function getTotalContacts(
  client: CachedGHLClient,
  opts: GHLClientOptions,
): Promise<number> {
  const response = await client.getContacts(
    {
      locationId: opts.locationId,
      limit: 1,
    },
    opts,
  );

  return response.meta?.total ?? 0;
}

async function getUnreadInbox(
  client: CachedGHLClient,
  opts: GHLClientOptions,
): Promise<number> {
  const response = await client.getConversations(
    {
      locationId: opts.locationId,
      limit: 1,
      unreadOnly: true,
    },
    opts,
  );

  return response.meta?.total ?? 0;
}

function numberFromSettled(
  label: string,
  result: PromiseSettledResult<number>,
): { value: number; failed: boolean } {
  if (result.status === "fulfilled") {
    return { value: result.value, failed: false };
  }

  console.error(`[api/ghl/summary] ${label} failed`, result.reason);
  return { value: 0, failed: true };
}

export async function GET() {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tierConfig = await getTierConfig(session.accountId);
  const defaultCachedAt = inferGhlCachedAtIso(session.accountId, tierConfig.cacheTTL);

  try {
    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("ghl_location_id, ghl_token_encrypted")
      .eq("id", session.accountId)
      .maybeSingle();

    if (
      accountError ||
      !account?.ghl_location_id ||
      !account.ghl_token_encrypted
    ) {
      if (accountError) {
        console.error("[api/ghl/summary] account lookup failed", accountError.message);
      }

      return NextResponse.json(stubSummary(defaultCachedAt));
    }

    let credentials: Awaited<ReturnType<typeof getAccountGhlCredentials>>;
    try {
      credentials = await getAccountGhlCredentials(session.accountId);
    } catch (error) {
      console.error("[api/ghl/summary] credential lookup failed", error);
      return NextResponse.json(stubSummary(defaultCachedAt));
    }

    const client = cachedGHLClient(session.accountId);
    const opts: GHLClientOptions = {
      locationId: credentials.locationId,
      apiKey: credentials.accessToken,
    };

    const results = await Promise.allSettled([
      getOpenLeads(client, opts),
      getConversationsToday(client, opts),
      getTotalContacts(client, opts),
      getUnreadInbox(client, opts),
    ]);

    const openLeads = numberFromSettled("openLeads", results[0]);
    const conversationsToday = numberFromSettled("conversationsToday", results[1]);
    const totalContacts = numberFromSettled("totalContacts", results[2]);
    const unreadInbox = numberFromSettled("unreadInbox", results[3]);

    const isStub =
      openLeads.failed ||
      conversationsToday.failed ||
      totalContacts.failed ||
      unreadInbox.failed;

    return NextResponse.json({
      openLeads: openLeads.value,
      conversationsToday: conversationsToday.value,
      totalContacts: totalContacts.value,
      unreadInbox: unreadInbox.value,
      isStub,
      cachedAt: inferGhlCachedAtIso(session.accountId, tierConfig.cacheTTL),
    } satisfies GHLSummaryResponse);
  } catch (error) {
    console.error("[api/ghl/summary] unexpected error", error);
    return NextResponse.json(stubSummary(defaultCachedAt));
  }
}
