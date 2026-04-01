import { NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { GHLClient, getAccountGhlCredentials } from "@/lib/ghl";
import { createServerClient } from "@/lib/supabase/server";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...init?.headers,
    },
  });
}

export async function GET() {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);

  if (!session) {
    return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  }

  let start: number | null = null;

  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(
      session.accountId,
    );
    const client = GHLClient.forLocation(locationId, accessToken);

    start = Date.now();
    await client.contacts.list({ limit: 1 });

    return noStoreJson({ status: "connected", latencyMs: Date.now() - start });
  } catch {
    return noStoreJson(
      { status: "error", latencyMs: start ? Date.now() - start : 0 },
      { status: 503 },
    );
  }
}
