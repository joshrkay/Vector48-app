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
  const startedAt = Date.now();
  let parseMs = 0;
  let lookupMs = 0;
  let insertMs = 0;

  // 1) Parse body
  let body: Record<string, unknown>;
  const parseStartedAt = Date.now();
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  parseMs = Date.now() - parseStartedAt;

  // 2) Resolve account from location ID
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

  const supabase = getSupabaseAdmin();
  const lookupStartedAt = Date.now();
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id")
    .eq("ghl_location_id", locationId)
    .limit(1);
  lookupMs = Date.now() - lookupStartedAt;

  const account = accounts?.[0] ?? null;
  if (!account) {
    // Don't retry — likely a deleted or unlinked account
    console.warn("[ghl-webhook] No account for locationId:", locationId);
    return NextResponse.json({ received: true });
  }

  // 3) Verify webhook secret/signature before processing
  const webhookSecret = process.env.GHL_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[ghl-webhook] GHL_WEBHOOK_SECRET is not set. Rejecting request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const signature = req.headers.get("x-ghl-signature");
  if (!verifyToken(signature, webhookSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 4) Normalize payload
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
