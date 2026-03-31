// ---------------------------------------------------------------------------
// GoHighLevel API v2 — Webhooks
// ---------------------------------------------------------------------------

import { ghlGet, ghlPost, type GHLClientOptions } from "./client";
import type {
  GHLCreateWebhookPayload,
  GHLWebhookResponse,
  GHLWebhooksListResponse,
} from "./types";

/**
 * Register a webhook on a GHL location.
 * Uses the location's own API token.
 */
export function createWebhook(
  data: GHLCreateWebhookPayload,
  opts?: GHLClientOptions,
): Promise<GHLWebhookResponse> {
  return ghlPost<GHLWebhookResponse>("/webhooks", data, opts);
}

/**
 * List all webhooks registered on a location.
 * Used for idempotency checks before creating a new webhook.
 */
export function listWebhooks(
  locationId: string,
  opts?: GHLClientOptions,
): Promise<GHLWebhooksListResponse> {
  return ghlGet<GHLWebhooksListResponse>("/webhooks", {
    ...opts,
    params: { locationId },
  });
}
