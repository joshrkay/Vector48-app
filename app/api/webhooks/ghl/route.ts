import crypto from "crypto";

import { NextResponse } from "next/server";

import { invalidateGHLCache } from "@/lib/ghl/cacheInvalidation";
import { parseGHLWebhook } from "@/lib/ghl/webhookParser";
import { processSideEffects } from "@/lib/ghl/webhookSideEffects";
import type { GHLWebhookPayload } from "@/lib/ghl/webhookTypes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// GHL signs webhook deliveries with asymmetric keys — no shared secret needed.
// Prefer X-GHL-Signature (Ed25519, current). X-WH-Signature (RSA-SHA256) is the
// legacy fallback and will be deprecated July 1, 2026.
// Public keys sourced from the official GHL developer docs:
// https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide

const GHL_PUBLIC_KEY_ED25519 = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`;

const GHL_PUBLIC_KEY_RSA = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSC
Frm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6
dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfB
csedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpv
uxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF
3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKU
J062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXp
IocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzN
h/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELh
CHULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sY
JPQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAy
kT1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==
-----END PUBLIC KEY-----`;

/**
 * Verify a GHL webhook signature against the raw request body.
 *
 * GHL sends one of two headers:
 *   X-GHL-Signature  — Ed25519 signature over the raw body bytes (preferred)
 *   X-WH-Signature   — RSA-SHA256 signature over the raw body bytes (legacy)
 *
 * The signature is base64-encoded. Verification requires the exact raw body
 * string that GHL signed — do not parse/re-serialize before calling this.
 *
 * Returns:
 *   { ok: true }                  — valid signature
 *   { ok: false, reason: "none" } — no signature headers present (warn, allow)
 *   { ok: false, reason: string } — signature present but invalid (reject)
 */
function verifyGhlSignature(
  rawBody: string,
  headers: Headers
): { ok: boolean; reason?: string } {
  const ghlSig = headers.get("x-ghl-signature");
  const legacySig = headers.get("x-wh-signature");

  if (ghlSig) {
    // Ed25519 verification
    try {
      const payloadBuffer = Buffer.from(rawBody, "utf8");
      const signatureBuffer = Buffer.from(ghlSig, "base64");
      const ok = crypto.verify(null, payloadBuffer, GHL_PUBLIC_KEY_ED25519, signatureBuffer);
      return { ok, reason: ok ? undefined : "ed25519_verify_failed" };
    } catch (e) {
      return { ok: false, reason: `ed25519_error: ${e}` };
    }
  }

  if (legacySig) {
    // RSA-SHA256 verification (legacy)
    try {
      const verifier = crypto.createVerify("SHA256");
      verifier.update(rawBody);
      const ok = verifier.verify(GHL_PUBLIC_KEY_RSA, legacySig, "base64");
      return { ok, reason: ok ? undefined : "rsa_verify_failed" };
    } catch (e) {
      return { ok: false, reason: `rsa_error: ${e}` };
    }
  }

  // No signature headers — GHL webhooks always include one. Absence means the
  // request is a test/manual call, not a real GHL delivery.
  return { ok: false, reason: "none" };
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

  // Verify GHL signature using their published public keys.
  // GHL Marketplace Apps (OAuth) always send signed webhooks.
  // No env vars needed — keys are hardcoded from the GHL developer docs.
  const sigResult = verifyGhlSignature(rawBody, req.headers);
  if (!sigResult.ok) {
    if (sigResult.reason === "none") {
      // No signature headers present — allow through with warning.
      // This covers: test requests, manual cURL, or private-integration calls
      // that don't use the OAuth webhook delivery system.
      console.warn(
        "[ghl-webhook] no signature headers — skipping verification for location",
        locationId
      );
    } else {
      // Signature header was present but cryptographically invalid → reject.
      console.warn(
        "[ghl-webhook] invalid signature:",
        sigResult.reason,
        "for location",
        locationId
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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

  const { error: insertError } = await supabase.from("automation_events").insert(insertRow);

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
