// ---------------------------------------------------------------------------
// GoHighLevel — Shared In-Memory Cache Store
// Used by cache.ts (read/write) and cacheInvalidation.ts (delete).
// Server-only.
// ---------------------------------------------------------------------------

export interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

/**
 * Module-level in-memory cache. Keys follow the pattern:
 *   ghl:{accountId}:{resource}:{paramsHash}
 */
export const cacheStore = new Map<string, CacheEntry>();

// ── Periodic sweep to prevent unbounded growth ────────────────────────────

const SWEEP_INTERVAL_MS = 5 * 60_000;

let sweepTimer: ReturnType<typeof setInterval> | null = null;

export function ensureSweep() {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of Array.from(cacheStore.entries())) {
      if (entry.expiresAt <= now) {
        cacheStore.delete(key);
      }
    }
    if (cacheStore.size === 0 && sweepTimer) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
  }, SWEEP_INTERVAL_MS);
  if (typeof sweepTimer === "object" && "unref" in sweepTimer) {
    (sweepTimer as { unref: () => void }).unref();
  }
}
