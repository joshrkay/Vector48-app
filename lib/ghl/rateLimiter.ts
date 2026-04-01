// ---------------------------------------------------------------------------
// GoHighLevel — Tier-Aware Per-Account Rate Limiter
// Uses a per-account 60-second sliding window of request timestamps.
// Budget is determined by the account's pricing tier. When the budget is
// exhausted, requests are queued and resolved once capacity is available.
// Server-only.
// ---------------------------------------------------------------------------

import { getTierConfig } from "./tierConfig";

// ── Constants ─────────────────────────────────────────────────────────────

const WINDOW_MS = 60_000; // 60-second sliding window
const STALE_CLEANUP_MS = 5 * 60_000; // clean up buckets idle for 5 min
const DEFAULT_BUDGET = 60; // fallback if tier lookup hasn't resolved yet

// ── Per-account bucket state ──────────────────────────────────────────────

interface Bucket {
  accountId: string;
  budget: number;
  requestTimestamps: number[];
  queue: Array<() => void>;
  wakeTimer: ReturnType<typeof setTimeout> | null;
  lastAccess: number;
  lock: Promise<void>;
}

const buckets = new Map<string, Bucket>();

// ── Periodic cleanup of stale buckets ─────────────────────────────────────

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, bucket] of Array.from(buckets.entries())) {
      if (now - bucket.lastAccess > STALE_CLEANUP_MS) {
        if (bucket.wakeTimer) clearTimeout(bucket.wakeTimer);
        buckets.delete(id);
      }
    }
    if (buckets.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, STALE_CLEANUP_MS);
  if (typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    (cleanupTimer as { unref: () => void }).unref();
  }
}

async function runExclusive<T>(bucket: Bucket, fn: () => T | Promise<T>): Promise<T> {
  const previous = bucket.lock;
  let release!: () => void;
  bucket.lock = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

function pruneExpired(bucket: Bucket, now: number) {
  const cutoff = now - WINDOW_MS;
  while (bucket.requestTimestamps.length > 0 && bucket.requestTimestamps[0]! <= cutoff) {
    bucket.requestTimestamps.shift();
  }
}

function scheduleWake(bucket: Bucket, delayMs: number) {
  if (bucket.wakeTimer) return;

  bucket.wakeTimer = setTimeout(() => {
    void runExclusive(bucket, () => {
      bucket.wakeTimer = null;
      const now = Date.now();
      bucket.lastAccess = now;
      pruneExpired(bucket, now);

      if (bucket.queue.length === 0) return;

      if (bucket.requestTimestamps.length < bucket.budget) {
        const wake = bucket.queue.shift();
        wake?.();
      }

      scheduleNextWake(bucket);
    });
  }, Math.max(0, delayMs));

  if (typeof bucket.wakeTimer === "object" && "unref" in bucket.wakeTimer) {
    (bucket.wakeTimer as { unref: () => void }).unref();
  }
}

function scheduleNextWake(bucket: Bucket) {
  if (bucket.queue.length === 0 || bucket.wakeTimer) return;

  const now = Date.now();
  pruneExpired(bucket, now);

  if (bucket.requestTimestamps.length < bucket.budget) {
    scheduleWake(bucket, 0);
    return;
  }

  const earliest = bucket.requestTimestamps[0];
  if (typeof earliest !== "number") {
    scheduleWake(bucket, 0);
    return;
  }

  const delayMs = earliest + WINDOW_MS - now;
  scheduleWake(bucket, delayMs);
}

// ── Get or create a bucket for an account ─────────────────────────────────

async function getBucket(accountId: string): Promise<Bucket> {
  let bucket = buckets.get(accountId);
  if (bucket) {
    bucket.lastAccess = Date.now();
    return bucket;
  }

  let budget = DEFAULT_BUDGET;
  try {
    const config = await getTierConfig(accountId);
    budget = config.rateLimitBudget;
  } catch {
    // Fall back to default budget on error
  }

  bucket = {
    accountId,
    budget,
    requestTimestamps: [],
    queue: [],
    wakeTimer: null,
    lastAccess: Date.now(),
    lock: Promise.resolve(),
  };

  buckets.set(accountId, bucket);
  ensureCleanup();

  return bucket;
}

async function refreshBudget(bucket: Bucket) {
  try {
    const config = await getTierConfig(bucket.accountId);
    bucket.budget = config.rateLimitBudget;
  } catch {
    // Keep existing budget on error
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Acquires a rate-limit slot for the given account. Resolves immediately
 * if budget is available; otherwise queues and resolves when capacity
 * becomes available. Never rejects — the caller just waits.
 */
export async function acquireRateLimit(accountId: string): Promise<void> {
  const bucket = await getBucket(accountId);
  await runExclusive(bucket, () => refreshBudget(bucket));

  let wakePromise: Promise<void> | null = null;

  while (true) {
    wakePromise = await runExclusive<Promise<void> | null>(bucket, () => {
      const now = Date.now();
      bucket.lastAccess = now;
      pruneExpired(bucket, now);

      // Preserve ordering: while there is a queue, all new callers join it.
      if (bucket.requestTimestamps.length < bucket.budget && bucket.queue.length === 0) {
        bucket.requestTimestamps.push(now);
        return null;
      }

      const waiter = new Promise<void>((resolve) => {
        bucket.queue.push(resolve);
      });

      scheduleNextWake(bucket);
      return waiter;
    });

    if (!wakePromise) {
      // Successfully recorded this request timestamp.
      await runExclusive(bucket, () => {
        if (bucket.queue.length > 0) {
          scheduleNextWake(bucket);
        }
      });
      return;
    }

    await wakePromise;
    // On wakeup, loop and re-check budget under lock.
  }
}
