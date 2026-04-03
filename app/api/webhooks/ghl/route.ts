import crypto from "crypto";

import { NextResponse } from "next/server";

import { invalidateGHLCache } from "@/lib/ghl/cacheInvalidation";
import { parseGHLWebhook } from "@/lib/ghl/webhookParser";
import { processSideEffects } from "@/lib/ghl/webhookSideEffects";
import type { GHLWebhookPayload } from "@/lib/ghl/webhookTypes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// GHL Private Integration webhooks use a single global verification token
// configured in the GHL Marketplace dashboard (Advanced Settings → Webhooks).
// There is no per-location webhook registration API — all locations share one
// webhook URL and one secret. Store it as GHL_WEBHOOK_SECRET in Vercel env vars.
const GLOBAL_WEBHOOK_SECRET = process.env.GHL_WEBHOOK_SECRET ?? null;

function verifyToken(provided: string | null, expected: string | null): boolean {
  if (!provided || !expected) return false;
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function tokenFromRequest(headers: Headers, body: Record<string, unknown>): string | null {
  return (
    headers.get("x-ghl-signature") ??
    headers.get("x-ghl-webhook-secret") ??
    (typeof body.verificationToken === "string" ? body.verificationToken : null) ??
    (typeof body.token === "string" ? body.token : null)
  );
}

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

  let body: GHLWebhookPayload | Record<string, unknown>;
  try {
    body = (await req.json()) as GHLWebhookPayload;
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

  // Verify using the global webhook secret configured in the GHL Marketplace
  // dashboard. If GHL_WEBHOOK_SECRET is not yet set in env vars, log a warning
  // but still process the event — prevents a silent shutdown of all webhooks
  // during initial setup.
  if (GLOBAL_WEBHOOK_SECRET) {
    const providedToken = tokenFromRequest(req.headers, payload);
    if (!providedToken) {
      console.warn("[ghl-webhook] missing signature header for location", locationId);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!verifyToken(providedToken, GLOBAL_WEBHOOK_SECRET)) {
      console.warn("[ghl-webhook] invalid signature for location", locationId);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    console.warn("[ghl-webhook] GHL_WEBHOOK_SECRET not set — skipping signature verification");
  }

  const ghlEventType = parseEventType(payload);
  const normalized = parseGHLWebhook(payload, ghlEventType);

  if (!normalized) {
    return NextResponse.json({ received: true });
  }

  const insertRow = {
    ...normalized,
    account_id: account.id,
  };

  const { error: insertError } = await supabase
    .from("automation_events")
    .insert(insertRow);

  if (insertError) {
    if (isDuplicateAutomationEventError(insertError)) {
      return NextResponse.json({ received: true });
    }

    console.error("[ghl-webhook] failed to write automation event", insertError.message);
  } else {
    invalidateGHLCache(account.id, ghlEventType, { invalidateInMemoryFallback: true });

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
