// ---------------------------------------------------------------------------
// GoHighLevel — Tier-Aware Per-Account Rate Limiter
// Uses a sliding-window token bucket per account. Budget is determined by
// the account's pricing tier. When the budget is exhausted, requests are
// queued and resolved once the window resets (no errors — just delayed).
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
  tokens: number;
  budget: number;
  windowStart: number;
  queue: Array<() => void>;
  refillTimer: ReturnType<typeof setTimeout> | null;
  lastAccess: number;
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
        if (bucket.refillTimer) clearTimeout(bucket.refillTimer);
        buckets.delete(id);
      }
    }
    if (buckets.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, STALE_CLEANUP_MS);
  // Don't block process exit
  if (typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    (cleanupTimer as { unref: () => void }).unref();
  }
}

// ── Get or create a bucket for an account ─────────────────────────────────

async function getBucket(accountId: string): Promise<Bucket> {
  let bucket = buckets.get(accountId);
  if (bucket) {
    bucket.lastAccess = Date.now();
    return bucket;
  }

  // Load the tier budget
  let budget = DEFAULT_BUDGET;
  try {
    const config = await getTierConfig(accountId);
    budget = config.rateLimitBudget;
  } catch {
    // Fall back to default budget on error
  }

  bucket = {
    accountId,
    tokens: budget,
    budget,
    windowStart: Date.now(),
    queue: [],
    refillTimer: null,
    lastAccess: Date.now(),
  };

  buckets.set(accountId, bucket);
  ensureCleanup();

  return bucket;
}

// ── Refill tokens and drain queued requests ───────────────────────────────

function refill(bucket: Bucket) {
  // Re-read tier config to pick up plan changes (getTierConfig is cached 60s)
  getTierConfig(bucket.accountId)
    .then((config) => {
      bucket.budget = config.rateLimitBudget;
    })
    .catch(() => {
      // Keep existing budget on error
    });

  bucket.tokens = bucket.budget;
  bucket.windowStart = Date.now();
  bucket.refillTimer = null;

  // Drain as many queued callers as we have tokens
  while (bucket.queue.length > 0 && bucket.tokens > 0) {
    bucket.tokens--;
    const resolve = bucket.queue.shift()!;
    resolve();
  }

  // If there are still queued requests, schedule the next refill
  if (bucket.queue.length > 0) {
    scheduleRefill(bucket);
  }
}

function scheduleRefill(bucket: Bucket) {
  if (bucket.refillTimer) return;

  const elapsed = Date.now() - bucket.windowStart;
  const waitMs = Math.max(WINDOW_MS - elapsed, 50);

  bucket.refillTimer = setTimeout(() => refill(bucket), waitMs);
  if (typeof bucket.refillTimer === "object" && "unref" in bucket.refillTimer) {
    (bucket.refillTimer as { unref: () => void }).unref();
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Acquires a rate-limit token for the given account. Resolves immediately
 * if budget is available; otherwise queues and resolves when the window
 * resets. Never rejects — the caller just waits.
 */
export async function acquireRateLimit(accountId: string): Promise<void> {
  const bucket = await getBucket(accountId);

  // Refill if the window has fully elapsed
  const elapsed = Date.now() - bucket.windowStart;
  if (elapsed >= WINDOW_MS) {
    refill(bucket);
  }

  // Try to consume a token immediately
  if (bucket.tokens > 0) {
    bucket.tokens--;
    return;
  }

  // No tokens available — queue this request
  return new Promise<void>((resolve) => {
    bucket.queue.push(resolve);
    scheduleRefill(bucket);
  });
}
