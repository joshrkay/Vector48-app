import "server-only";

import { cacheStore } from "./cacheStore";

export function inferGhlCachedAtIso(
  accountId: string,
  cacheTtlSeconds: number,
): string {
  const prefix = `ghl:${accountId}:`;
  const now = Date.now();
  const inferredWrites: number[] = [];

  for (const [key, entry] of Array.from(cacheStore.entries())) {
    if (!key.startsWith(prefix)) continue;

    const inferredWrittenAt = entry.expiresAt - cacheTtlSeconds * 1_000;
    inferredWrites.push(Math.min(inferredWrittenAt, now));
  }

  if (inferredWrites.length === 0) {
    return new Date(now).toISOString();
  }

  return new Date(Math.max(...inferredWrites)).toISOString();
}
