// ---------------------------------------------------------------------------
// GoHighLevel — Cache Invalidation
// Called by the webhook handler to bust cached GHL data for an account.
// Server-only.
// ---------------------------------------------------------------------------

import { cacheStore } from "./cacheStore";

// ── Event → resource mapping ──────────────────────────────────────────────

const EVENT_RESOURCE_MAP: Record<string, string[]> = {
  ContactCreate: ["contacts"],
  ContactUpdate: ["contacts"],
  OpportunityCreate: ["opportunities"],
  OpportunityStageUpdate: ["opportunities"],
  AppointmentCreate: ["appointments"],
  AppointmentStatusUpdate: ["appointments"],
  ConversationUnreadUpdate: ["conversations"],
  InboundMessage: ["conversations"],
};

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Invalidates cached GHL data for the given account based on the webhook
 * event type. Only busts the relevant resource caches.
 *
 * @returns The number of cache entries deleted.
 */
export function invalidateGHLCache(
  accountId: string,
  eventType: string,
): number {
  const resources = EVENT_RESOURCE_MAP[eventType];
  if (!resources || resources.length === 0) return 0;

  let deleted = 0;
  const prefixes = resources.map((r) => `ghl:${accountId}:${r}:`);

  for (const key of Array.from(cacheStore.keys())) {
    if (prefixes.some((p) => key.startsWith(p))) {
      cacheStore.delete(key);
      deleted++;
    }
  }

  return deleted;
}

/**
 * Clears all cached GHL data for an account (e.g., on plan change or
 * account disconnect).
 */
export function invalidateAllForAccount(accountId: string): number {
  const prefix = `ghl:${accountId}:`;
  let deleted = 0;

  for (const key of Array.from(cacheStore.keys())) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key);
      deleted++;
    }
  }

  return deleted;
}
