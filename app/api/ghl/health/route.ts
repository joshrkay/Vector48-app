import { NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { tryGetAccountGhlCredentials, withAuthRetry } from "@/lib/ghl";
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

  // Return a clear "not connected" status instead of 503 when GHL isn't set up
  const creds = await tryGetAccountGhlCredentials(session.accountId);
  if (!creds) {
    return noStoreJson({ status: "not_connected", latencyMs: 0 });
  }

  const start = Date.now();

  try {
    await withAuthRetry(session.accountId, async (client) => {
      await client.contacts.list({ limit: 1 });
    });

    return noStoreJson({ status: "connected", latencyMs: Date.now() - start });
  } catch {
    return noStoreJson(
      { status: "error", latencyMs: Date.now() - start },
      { status: 503 },
    );
  }
}
