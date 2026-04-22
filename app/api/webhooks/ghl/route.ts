import { NextResponse } from "next/server";

import { invalidateGHLCache } from "@/lib/ghl/cacheInvalidation";
import { parseGHLWebhook } from "@/lib/ghl/webhookParser";
import { processSideEffects } from "@/lib/ghl/webhookSideEffects";
import type { GHLWebhookPayload } from "@/lib/ghl/webhookTypes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { authenticateGhlWebhook } from "./signatureVerification";

function parseEventType(payload: Record<string, unknown>): string {
  if (typeof payload.type === "string") return payload.type;
  if (typeof payload.event === "string") return payload.event;
  return "unknown";
}

function isDuplicateAutomationEventError(error: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}): boolean {
  if (error.code === "23505") return true;
  return (
    error.message?.includes("duplicate key value violates unique constraint") === true ||
    error.details?.includes("idx_automation_events_ghl_dedup") === true
  );
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  // Read raw body first — required for signature verification over the exact
  // bytes that GHL signed. Parsing JSON first would lose whitespace fidelity.
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ received: true });
  }

  let body: GHLWebhookPayload | Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as GHLWebhookPayload;
  } catch {
    return NextResponse.json({ received: true });
  }

  const payload = body as Record<string, unknown>;
  const locationId =
    typeof payload.locationId === "string"
      ? payload.locationId
      : typeof payload.location_id === "string"
        ? payload.location_id
        : null;

  if (!locationId) {
    console.warn("[ghl-webhook] missing locationId");
    return NextResponse.json({ received: true });
  }

  const supabase = getSupabaseAdmin();
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id")
    .eq("ghl_location_id", locationId)
    .maybeSingle();

  if (accountError) {
    console.error("[ghl-webhook] account lookup failed", accountError.message);
    return NextResponse.json({ received: true });
  }

  if (!account) {
    console.warn("[ghl-webhook] no account mapped for location", locationId);
    return NextResponse.json({ received: true });
  }

  const authResult = authenticateGhlWebhook(rawBody, req.headers);
  if (!authResult.ok) {
    console.warn("[ghl-webhook] webhook authentication failed", {
      reason: authResult.reason,
      locationId,
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ghlEventType = parseEventType(payload);

  // Invalidate cache for every resource-changing event we recognize, regardless
  // of whether we persist it to automation_events. This catches delete and
  // note events that aren't in SUPPORTED_EVENT_TYPES but still mutate upstream
  // state we've cached. revalidateTag is idempotent, so re-invalidation on
  // webhook redelivery is harmless.
  invalidateGHLCache(account.id, ghlEventType, { invalidateInMemoryFallback: true });

  const normalized = parseGHLWebhook(payload, ghlEventType);

  if (!normalized) {
    return NextResponse.json({ received: true });
  }

  const insertRow = {
    ...normalized,
    account_id: account.id,
  };

  const { error: insertError } = await supabase.from("automation_events").insert(insertRow);

  if (insertError) {
    if (isDuplicateAutomationEventError(insertError)) {
      return NextResponse.json({ received: true });
    }

    console.error("[ghl-webhook] failed to write automation event", insertError.message);
  } else {
    queueMicrotask(() => {
      void processSideEffects(account.id, { ...normalized, account_id: account.id }, payload);
    });
  }

  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs > 4500) {
    console.warn(`[ghl-webhook] slow request (${elapsedMs}ms) for ${ghlEventType}`);
  }

  return NextResponse.json({ received: true });
}
