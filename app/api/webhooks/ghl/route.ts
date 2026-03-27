import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { parseGHLWebhook } from "@/lib/ghl/webhookParser";
import { processSideEffects } from "@/lib/ghl/webhookSideEffects";

// Supabase admin client — bypasses RLS (no user session on webhooks)
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Timing-safe token comparison to prevent timing attacks
function verifyToken(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  // 1. Verify webhook token
  const webhookSecret = process.env.GHL_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature = req.headers.get("x-ghl-signature");
    if (!verifyToken(signature, webhookSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // 2. Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 3. Extract location ID (casing varies across GHL events)
  const locationId =
    (body.locationId as string) ?? (body.location_id as string) ?? null;

  if (!locationId) {
    console.warn("[ghl-webhook] Payload missing locationId:", body.type ?? body.event);
    return NextResponse.json({ received: true });
  }

  // 4. Look up account by GHL location ID
  const supabase = getAdminClient();
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id")
    .or(`ghl_location_id.eq.${locationId},ghl_sub_account_id.eq.${locationId}`)
    .single();

  if (accountError || !account) {
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

  // 6. Insert into event_log with idempotency
  const { error: insertError } = await supabase
    .from("event_log")
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
