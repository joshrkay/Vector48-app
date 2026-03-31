import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseGHLWebhook } from "@/lib/ghl/webhookParser";
import { processSideEffects } from "@/lib/ghl/webhookSideEffects";
import { invalidateGHLCache } from "@/lib/ghl/cacheInvalidation";

// Timing-safe token comparison — hash both sides to fixed length so
// timingSafeEqual never leaks the secret's length via early return.
function verifyToken(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  try {
    const a = crypto.createHash("sha256").update(provided).digest();
    const b = crypto.createHash("sha256").update(expected).digest();
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  // 1. Parse body
  let body: Record<string, unknown>;
  const parseStartedAt = Date.now();
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  parseMs = Date.now() - parseStartedAt;

  // 2. Extract and validate location ID (casing varies across GHL events)
  const rawLocationId = body.locationId ?? body.location_id;
  const locationId =
    typeof rawLocationId === "string" && rawLocationId.length > 0
      ? rawLocationId
      : null;

  if (!locationId) {
    console.warn("[ghl-webhook] Payload missing locationId:", body.type ?? body.event);
    return NextResponse.json({ received: true });
  }

  // GHL location IDs are alphanumeric — reject anything unexpected
  // to prevent PostgREST filter injection via special characters
  if (!/^[\w-]+$/.test(locationId)) {
    console.warn("[ghl-webhook] Invalid locationId format:", locationId);
    return NextResponse.json({ received: true });
  }

  // 3. Look up account by GHL location ID
  // Use .limit(1) instead of .single() to avoid errors when no rows match
  const supabase = getSupabaseAdmin();
  const lookupStartedAt = Date.now();
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, ghl_webhook_secret")
    .eq("ghl_location_id", locationId)
    .limit(1);
  lookupMs = Date.now() - lookupStartedAt;

  const account = accounts?.[0] ?? null;
  if (!account) {
    // Don't retry — likely a deleted or unlinked account
    console.warn("[ghl-webhook] No account for locationId:", locationId);
    return NextResponse.json({ received: true });
  }

  // 4. Verify webhook token using account-level shared secret
  const providedTokenFromHeader = req.headers.get("x-ghl-signature");
  const providedTokenFromBody =
    (typeof body.token === "string" && body.token.length > 0
      ? body.token
      : null) ??
    (typeof body.webhookSecret === "string" && body.webhookSecret.length > 0
      ? body.webhookSecret
      : null) ??
    (typeof body.webhook_secret === "string" && body.webhook_secret.length > 0
      ? body.webhook_secret
      : null);

  const providedToken = providedTokenFromHeader ?? providedTokenFromBody;
  const expectedToken = account.ghl_webhook_secret;
  if (!expectedToken || !verifyToken(providedToken, expectedToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 5. Parse event type and build normalized event
  const ghlEventType = (body.type as string) ?? (body.event as string) ?? "unknown";
  const parsed = parseGHLWebhook(body, ghlEventType);
  const eventRow = {
    ...parsed,
    account_id: account.id,
  };

  // 5) Attempt deduplicated insert (conflict-safe for retries)
  const insertStartedAt = Date.now();
  const { error: insertError } = await supabase
    .from("automation_events")
    .upsert(eventRow, {
      onConflict: "account_id,ghl_event_id",
      ignoreDuplicates: true,
    });
  insertMs = Date.now() - insertStartedAt;

  if (insertError) {
    console.error("[ghl-webhook] Insert failed:", insertError.message);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }

  // 7. Fire-and-forget cache invalidation — must not block the response
  Promise.resolve()
    .then(() => invalidateGHLCache(account.id, ghlEventType))
    .catch((err) => console.error("[ghl-webhook] Cache invalidation error:", err));

  // 8. Fire side effects async — must not block the response
  processSideEffects(account.id, eventRow, body).catch((err) =>
    console.error("[ghl-webhook] Side effect error:", err)
  );

  return response;
}
