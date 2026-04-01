import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { invalidateGHLCache } from "@/lib/ghl/cacheInvalidation";
import { parseGHLWebhook } from "@/lib/ghl/webhookParser";
import type { GHLWebhookPayload } from "@/lib/ghl/webhookTypes";
import { processSideEffects } from "@/lib/ghl/webhookSideEffects";

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
    .select("id, ghl_webhook_secret")
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

  const providedToken = tokenFromRequest(req.headers, payload);
  const expectedToken =
    typeof (account as { ghl_webhook_secret?: unknown }).ghl_webhook_secret === "string"
      ? ((account as { ghl_webhook_secret: string }).ghl_webhook_secret)
      : null;

  if (!verifyToken(providedToken, expectedToken)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ghlEventType = parseEventType(payload);
  const normalized = parseGHLWebhook(payload, ghlEventType);

  const insertRow = {
    ...normalized,
    account_id: account.id,
  };

  const { error: insertError } = await supabase
    .from("automation_events")
    // @ts-ignore – insertRow type is structurally compatible with Insert
    .upsert(insertRow, {
      onConflict: "account_id,ghl_event_id",
      ignoreDuplicates: true,
    });

  if (insertError) {
    console.error("[ghl-webhook] failed to write automation event", insertError.message);
  }

  invalidateGHLCache(account.id, ghlEventType);

  // Fire-and-forget side effects. Do not await so webhook returns quickly.
  queueMicrotask(() => {
    void processSideEffects(account.id, { ...normalized, account_id: account.id }, payload);
  });

  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs > 4500) {
    console.warn(`[ghl-webhook] slow request (${elapsedMs}ms) for ${ghlEventType}`);
  }

  return NextResponse.json({ received: true });
}
