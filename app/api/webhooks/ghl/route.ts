import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseGHLWebhook } from "@/lib/ghl/webhookParser";
import { processSideEffects } from "@/lib/ghl/webhookSideEffects";

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
  const bodyParseStartedAt = Date.now();
  let bodyParseMs = 0;

  // 1. Verify webhook token — secret must be configured
  const webhookSecret = process.env.GHL_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[ghl-webhook] GHL_WEBHOOK_SECRET is not set. Rejecting request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const signature = req.headers.get("x-ghl-signature");
  if (!verifyToken(signature, webhookSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  bodyParseMs = Date.now() - bodyParseStartedAt;

  // 3. Extract and validate location ID (casing varies across GHL events)
  const rawLocationId = body.locationId ?? body.location_id;
  const locationId =
    typeof rawLocationId === "string" && rawLocationId.length > 0
      ? rawLocationId
      : null;

  if (bodyParseMs > 1000) {
    console.warn(`[ghl-webhook] Slow payload parse: ${bodyParseMs}ms`);
  }

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

  // 4. Look up account by GHL location ID
  // Use .limit(1) instead of .single() to avoid errors when no rows match
  const supabase = getSupabaseAdmin();
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id")
    .eq("ghl_location_id", locationId)
    .limit(1);

  const account = accounts?.[0] ?? null;
  if (!account) {
    // Don't retry — likely a deleted or unlinked account
    console.warn("[ghl-webhook] No account for locationId:", locationId);
    return NextResponse.json({ received: true });
  }

  // 5. Parse event type and build normalized event
  const ghlEventType = (body.type as string) ?? (body.event as string) ?? "unknown";
  const parsed = parseGHLWebhook(body, ghlEventType);

  const eventRow = {
    ...parsed,
    account_id: account.id,
  };

  // 6. Insert into automation_events with idempotency
  const { error: insertError } = await supabase
    .from("automation_events")
    .insert(eventRow);

  if (insertError) {
    // 23505 = unique_violation — duplicate ghl_event_id, skip silently
    if (insertError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[ghl-webhook] Insert failed:", insertError.message);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }

  // 7. Fire side effects async — must not block the response
  processSideEffects(account.id, eventRow, body).catch((err) =>
    console.error("[ghl-webhook] Side effect error:", err)
  );

  return NextResponse.json({ received: true });
}
