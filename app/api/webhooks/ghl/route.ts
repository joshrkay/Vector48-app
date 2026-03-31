import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseGHLWebhook } from "@/lib/ghl/webhookParser";
import { processSideEffects } from "@/lib/ghl/webhookSideEffects";
import {
  normalizeGHLEventType,
  type GHLWebhookBase,
  type GHLWebhookCallCompleted,
  type GHLWebhookContactCreate,
  type GHLWebhookContactUpdate,
  type GHLWebhookConversationUnreadUpdate,
  type GHLWebhookDiscriminatedPayload,
  type GHLWebhookInboundMessage,
  type GHLWebhookOpportunityCreate,
  type GHLWebhookOpportunityStageUpdate,
  type GHLWebhookAppointmentCreate,
  type GHLWebhookAppointmentStatusUpdate,
} from "@/lib/ghl/webhookTypes";

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

function narrowPayload(
  normalizedType: ReturnType<typeof normalizeGHLEventType>,
  body: Record<string, unknown>
): GHLWebhookDiscriminatedPayload {
  switch (normalizedType) {
    case "contact_created":
      return { normalizedType, payload: body as GHLWebhookContactCreate };
    case "contact_updated":
      return { normalizedType, payload: body as GHLWebhookContactUpdate };
    case "call_completed":
      return { normalizedType, payload: body as GHLWebhookCallCompleted };
    case "message_received":
      return { normalizedType, payload: body as GHLWebhookInboundMessage };
    case "opportunity_created":
      return { normalizedType, payload: body as GHLWebhookOpportunityCreate };
    case "opportunity_moved":
      return { normalizedType, payload: body as GHLWebhookOpportunityStageUpdate };
    case "appointment_created":
      return { normalizedType, payload: body as GHLWebhookAppointmentCreate };
    case "appointment_updated":
      return { normalizedType, payload: body as GHLWebhookAppointmentStatusUpdate };
    case "conversation_unread":
      return { normalizedType, payload: body as GHLWebhookConversationUnreadUpdate };
    default:
      return { normalizedType: "ghl_event", payload: body as GHLWebhookBase & Record<string, unknown> };
  }
}

export async function POST(req: Request) {
  const parseStartedAt = Date.now();
  let parseMs = 0;

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

  let body: Record<string, unknown>;
  const parseStartedAt = Date.now();
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  parseMs = Date.now() - parseStartedAt;

  const rawLocationId = body.locationId ?? body.location_id;
  const locationId = typeof rawLocationId === "string" && rawLocationId.length > 0 ? rawLocationId : null;

  if (parseMs > 1000) {
    console.warn(`[ghl-webhook] Slow payload parse: ${parseMs}ms`);
  }

  if (!locationId) {
    console.warn("[ghl-webhook] Payload missing locationId:", body.type ?? body.event);
    return NextResponse.json({ received: true });
  }

  if (!/^[\w-]+$/.test(locationId)) {
    console.warn("[ghl-webhook] Invalid locationId format:", locationId);
    return NextResponse.json({ received: true });
  }

  const supabase = getSupabaseAdmin();
  const { data: accounts } = await supabase.from("accounts").select("id").eq("ghl_location_id", locationId).limit(1);

  const account = accounts?.[0] ?? null;
  if (!account) {
    console.warn("[ghl-webhook] No account for locationId:", locationId);
    return NextResponse.json({ received: true });
  }

  const rawType = (typeof body.type === "string" ? body.type : undefined) ??
    (typeof body.event === "string" ? body.event : undefined) ??
    "unknown";
  const normalizedType = normalizeGHLEventType(rawType);
  const narrowed = narrowPayload(normalizedType, body);
  const parsed = parseGHLWebhook(narrowed.payload as Record<string, unknown>, rawType);

  const eventRow = {
    ...parsed,
    account_id: account.id,
  };

  const { error: insertError } = await supabase.from("automation_events").insert(eventRow);

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[ghl-webhook] Insert failed:", insertError.message);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }

  processSideEffects(account.id, eventRow, body).catch((err) =>
    console.error("[ghl-webhook] Side effect error:", err)
  );

  return response;
}
