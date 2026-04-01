import { NextResponse } from "next/server";

import { requireAccountForUser } from "@/lib/auth/account";
import { cachedGHLClient } from "@/lib/ghl/cache";
import { cacheStore } from "@/lib/ghl/cacheStore";
import { getTierConfig } from "@/lib/ghl/tierConfig";
import type { GHLAppointment, GHLContact } from "@/lib/ghl/types";
import { createServerClient } from "@/lib/supabase/server";

type WidgetKey =
  | "newContacts"
  | "openOpportunities"
  | "unreadConversations"
  | "recentContacts"
  | "upcomingAppointments";

function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateAtUtcStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function inferLastSyncedIso(accountId: string, cacheTtlSeconds: number): string {
  const prefix = `ghl:${accountId}:`;
  const now = Date.now();
  const inferredAges: number[] = [];

  for (const [key, entry] of Array.from(cacheStore.entries())) {
    if (!key.startsWith(prefix)) continue;

    const inferredWrittenAt = entry.expiresAt - cacheTtlSeconds * 1_000;
    inferredAges.push(Math.min(inferredWrittenAt, now));
  }

  if (inferredAges.length === 0) {
    return new Date(now).toISOString();
  }

  return new Date(Math.max(...inferredAges)).toISOString();
}

function sortNewestFirst<T>(items: T[], getDate: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    return new Date(getDate(b)).getTime() - new Date(getDate(a)).getTime();
  });
}

export async function GET() {
  const supabase = await createServerClient();

  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = session.accountId;
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("ghl_location_id")
    .eq("id", accountId)
    .maybeSingle();

  if (accountError || !account?.ghl_location_id) {
    return NextResponse.json(
      { error: "GoHighLevel location is not connected" },
      { status: 400 },
    );
  }

  const locationId = account.ghl_location_id;
  const client = cachedGHLClient(accountId);

  const now = new Date();
  const todayStart = dateAtUtcStart(now);
  const sevenDayStart = new Date(todayStart);
  sevenDayStart.setUTCDate(sevenDayStart.getUTCDate() - 6);

  const [
    newContactsResult,
    openOpportunitiesResult,
    unreadConversationsResult,
    recentContactsResult,
    upcomingAppointmentsResult,
  ] = await Promise.allSettled([
    (async () => {
      const { contacts } = await client.getContacts(
        {
          limit: 250,
          sortBy: "dateAdded",
          sortOrder: "desc",
        },
        { locationId },
      );

      const contactsInWindow = contacts.filter((contact) => {
        return new Date(contact.dateAdded).getTime() >= sevenDayStart.getTime();
      });

      const breakdown = Array.from({ length: 7 }).map((_, idx) => {
        const day = new Date(sevenDayStart);
        day.setUTCDate(sevenDayStart.getUTCDate() + idx);
        const dayKey = toIsoDay(day);

        return {
          date: dayKey,
          count: contactsInWindow.filter((contact) => toIsoDay(new Date(contact.dateAdded)) === dayKey).length,
        };
      });

      return {
        count: contactsInWindow.length,
        breakdown,
      };
    })(),
    (async () => {
      const { opportunities } = await client.getOpportunities(
        {
          status: "open",
          limit: 250,
        },
        { locationId },
      );

      return {
        count: opportunities.length,
        totalMonetaryValue: opportunities.reduce((sum, opp) => {
          return sum + (typeof opp.monetaryValue === "number" ? opp.monetaryValue : 0);
        }, 0),
      };
    })(),
    (async () => {
      const { conversations } = await client.getConversations(
        {
          limit: 250,
          sortBy: "last_message_date",
          sort: "desc",
        },
        { locationId },
      );

      return {
        count: conversations.filter((conversation) => conversation.unreadCount > 0).length,
      };
    })(),
    (async () => {
      const { contacts } = await client.getContacts(
        {
          limit: 250,
          sortBy: "dateAdded",
          sortOrder: "desc",
        },
        { locationId },
      );

      const recent = sortNewestFirst(contacts, (contact) => contact.dateAdded)
        .slice(0, 5)
        .map((contact: GHLContact) => ({
          id: contact.id,
          name: contact.name,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          dateAdded: contact.dateAdded,
        }));

      return { contacts: recent };
    })(),
    (async () => {
      const { events } = await client.getAppointments(
        {
          startDate: todayStart.toISOString(),
          limit: 100,
        },
        { locationId },
      );

      const upcoming = sortNewestFirst(
        events.filter((event) => new Date(event.startTime).getTime() >= todayStart.getTime()),
        (event) => event.startTime,
      )
        .reverse()
        .slice(0, 5)
        .map((event: GHLAppointment) => ({
          id: event.id,
          title: event.title,
          status: event.status,
          startTime: event.startTime,
          endTime: event.endTime,
          contactId: event.contactId,
        }));

      return { appointments: upcoming };
    })(),
  ]);

  const settledByKey: Record<WidgetKey, PromiseSettledResult<unknown>> = {
    newContacts: newContactsResult,
    openOpportunities: openOpportunitiesResult,
    unreadConversations: unreadConversationsResult,
    recentContacts: recentContactsResult,
    upcomingAppointments: upcomingAppointmentsResult,
  };

  for (const [key, result] of Object.entries(settledByKey) as [
    WidgetKey,
    PromiseSettledResult<unknown>,
  ][]) {
    if (result.status === "rejected") {
      console.error(`[ghl-snapshot] Widget fetch failed: ${key} accountId=${accountId}`);
    }
  }

  const newContacts =
    newContactsResult.status === "fulfilled" ? newContactsResult.value : null;
  const openOpportunities =
    openOpportunitiesResult.status === "fulfilled"
      ? openOpportunitiesResult.value
      : null;
  const unreadConversations =
    unreadConversationsResult.status === "fulfilled"
      ? unreadConversationsResult.value
      : null;
  const recentContacts =
    recentContactsResult.status === "fulfilled" ? recentContactsResult.value : null;
  const upcomingAppointments =
    upcomingAppointmentsResult.status === "fulfilled"
      ? upcomingAppointmentsResult.value
      : null;

  const tierConfig = await getTierConfig(accountId);
  const payload = {
    newContacts,
    openOpportunities,
    unreadConversations,
    recentContacts,
    upcomingAppointments,
    lastSynced: inferLastSyncedIso(accountId, tierConfig.cacheTTL),
  };

  return NextResponse.json(payload, { status: 200 });
}
