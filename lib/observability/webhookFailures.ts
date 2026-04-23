import "server-only";

import crypto from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

export type WebhookProvider = "ghl" | "stripe";

export interface WebhookFailureRecord {
  provider: WebhookProvider;
  reason: string;
  accountId?: string | null;
  eventType?: string | null;
  rawBody?: string | null;
}

/**
 * Persist a webhook-auth / signature failure so ops can see it in a
 * dashboard instead of just in console logs. Best-effort — never throws,
 * so the webhook handler can still return its 401/400 quickly.
 *
 * We do not store the raw body (it might contain PII). We hash it instead
 * so support can match up redeliveries.
 */
export async function recordWebhookFailure(
  record: WebhookFailureRecord,
): Promise<void> {
  try {
    const supabase = createAdminClient();
    const payloadHash = record.rawBody
      ? crypto.createHash("sha256").update(record.rawBody).digest("hex").slice(0, 32)
      : null;

    await supabase.from("webhook_failures").insert({
      provider: record.provider,
      account_id: record.accountId ?? null,
      reason: record.reason.slice(0, 500),
      event_type: record.eventType ?? null,
      payload_hash: payloadHash,
    });
  } catch (err) {
    console.error("[webhook-failures] persist failed", {
      provider: record.provider,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
