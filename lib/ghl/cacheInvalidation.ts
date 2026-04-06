import { revalidateTag } from "next/cache";
import { cacheStore } from "./cacheStore";

const EVENT_TAG_MAP: Record<string, string[]> = {
  ContactCreate: ["contacts"],
  ContactUpdate: ["contacts"],
  OpportunityCreate: ["opportunities"],
  OpportunityStageUpdate: ["opportunities"],
  OpportunityStatusUpdate: ["opportunities"],
  AppointmentCreate: ["appointments"],
  AppointmentStatusUpdate: ["appointments"],
  ConversationUnreadUpdate: ["conversations"],
  InboundMessage: ["conversations"],
};

export function invalidateGHLCache(
  accountId: string,
  ghlEventType: string,
  options?: { invalidateInMemoryFallback?: boolean },
): void {
  const resources = EVENT_TAG_MAP[ghlEventType] ?? [];
  const invalidateInMemoryFallback = options?.invalidateInMemoryFallback ?? true;

  for (const resource of resources) {
    const tagPrefix = `ghl:${accountId}:${resource}`;

    // Primary path: Next.js fetch/data cache tag invalidation.
    revalidateTag(tagPrefix, "default");

    // Optional fallback: clear this process's in-memory cache wrapper entries.
    // This only affects custom non-fetch caches (Map-based), not Next.js data cache.
    if (invalidateInMemoryFallback) {
      for (const key of Array.from(cacheStore.keys())) {
        if (key.startsWith(`${tagPrefix}:`)) {
          cacheStore.delete(key);
        }
      }
    }
  }
}
