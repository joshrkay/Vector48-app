// ---------------------------------------------------------------------------
// GoHighLevel — Tier-Aware Per-Location Rate Limiter
// Uses a sliding-window token bucket per location (GHL quota scope).
// Budget is determined by account tier when accountId is available.
// Server-only.
// ---------------------------------------------------------------------------

import { getTierConfig } from "./tierConfig";

const WINDOW_MS = 60_000;
const STALE_CLEANUP_MS = 5 * 60_000;
const DEFAULT_BUDGET = 60;
const AGENCY_KEY = "__agency__";
const AGENCY_DEFAULT_BUDGET = 60;

interface AcquireRateLimitInput {
  accountId?: string | null;
  locationId?: string | null;
}

interface Bucket {
  key: string;
  accountId: string | null;
  tokens: number;
  budget: number;
  windowStart: number;
  queue: Array<() => void>;
  refillTimer: ReturnType<typeof setTimeout> | null;
  lastAccess: number;
}

const buckets = new Map<string, Bucket>();

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function normalizeBudget(budget: number): number {
  if (budget === 60 || budget === 90 || budget === 110) return budget;
  return DEFAULT_BUDGET;
}

async function resolveBudget(accountId: string | null): Promise<number> {
  if (!accountId) return AGENCY_DEFAULT_BUDGET;

  try {
    const config = await getTierConfig(accountId);
    return normalizeBudget(config.rateLimitBudget);
  } catch {
    return DEFAULT_BUDGET;
  }
}

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

  if (typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    (cleanupTimer as { unref: () => void }).unref();
  }
}

async function getBucket(params: AcquireRateLimitInput): Promise<Bucket> {
  const key = params.locationId ?? AGENCY_KEY;
  const accountId = params.accountId ?? null;

  let bucket = buckets.get(key);
  if (bucket) {
    bucket.lastAccess = Date.now();
    if (accountId && bucket.accountId !== accountId) {
      bucket.accountId = accountId;
    }
    return bucket;
  }

  const budget = await resolveBudget(accountId);
  bucket = {
    key,
    accountId,
    tokens: budget,
    budget,
    windowStart: Date.now(),
    queue: [],
    refillTimer: null,
    lastAccess: Date.now(),
  };

  buckets.set(key, bucket);
  ensureCleanup();

  return bucket;
}

function refill(bucket: Bucket) {
  resolveBudget(bucket.accountId)
    .then((budget) => {
      bucket.budget = budget;
    })
    .catch(() => {
      // Keep existing budget on error
    });

  bucket.tokens = bucket.budget;
  bucket.windowStart = Date.now();
  bucket.refillTimer = null;

  while (bucket.queue.length > 0 && bucket.tokens > 0) {
    bucket.tokens--;
    const resolve = bucket.queue.shift();
    resolve?.();
  }

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

export async function acquireRateLimit(
  params: AcquireRateLimitInput,
): Promise<void> {
  const bucket = await getBucket(params);

  const elapsed = Date.now() - bucket.windowStart;
  if (elapsed >= WINDOW_MS) {
    refill(bucket);
  }

  if (bucket.tokens > 0) {
    bucket.tokens--;
    return;
  }

  return new Promise<void>((resolve) => {
    bucket.queue.push(resolve);
    scheduleRefill(bucket);
  });
}
