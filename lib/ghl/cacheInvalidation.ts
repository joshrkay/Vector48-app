// ---------------------------------------------------------------------------
// GoHighLevel — Cache Invalidation
// Called by the webhook handler to bust cached GHL data for an account.
// Server-only.
// ---------------------------------------------------------------------------

import { revalidateTag } from "next/cache";
import { cacheStore } from "./cacheStore";

export type GHLCacheResource =
  | "contacts"
  | "opportunities"
  | "appointments"
  | "conversations";

// ── Event → resource mapping ──────────────────────────────────────────────

const EVENT_RESOURCE_MAP: Record<string, GHLCacheResource[]> = {
  ContactCreate: ["contacts"],
  ContactUpdate: ["contacts"],
  OpportunityCreate: ["opportunities"],
  OpportunityStageUpdate: ["opportunities"],
  AppointmentCreate: ["appointments"],
  AppointmentStatusUpdate: ["appointments"],
  ConversationUnreadUpdate: ["conversations"],
  InboundMessage: ["conversations"],
};

function buildAccountResourceTag(
  accountId: string,
  resource: GHLCacheResource,
): string {
  return `account:${accountId}:${resource}`;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Invalidates cached GHL data for the given account based on the webhook
 * event type. Only busts the relevant resource caches.
 *
 * Invalidation targets:
 * - Next.js tag cache via `revalidateTag(account:{id}:{resource})`
 * - In-memory GHL cache keys in the form `ghl:{accountId}:{resource}:...`
 *
 * @returns The number of in-memory cache entries deleted.
 */
export function invalidateGHLCache(
  accountId: string,
  eventType: string,
): number {
  const resources = EVENT_RESOURCE_MAP[eventType];
  if (!resources || resources.length === 0) return 0;

  for (const resource of resources) {
    revalidateTag(buildAccountResourceTag(accountId, resource));
  }

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
  const resources: GHLCacheResource[] = [
    "contacts",
    "opportunities",
    "appointments",
    "conversations",
  ];

  for (const resource of resources) {
    revalidateTag(buildAccountResourceTag(accountId, resource));
  }

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
