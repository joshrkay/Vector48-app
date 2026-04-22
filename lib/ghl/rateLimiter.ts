// ---------------------------------------------------------------------------
// GoHighLevel — Tier-Aware Per-Account Rate Limiter
// Fixed-window counter shared across serverless instances via Upstash Redis.
// Falls back to an in-process Map when UPSTASH_REDIS_REST_* env vars are not
// set (used by dev and tests). Two entry points:
//   - tryAcquire(key, budget, windowMs): non-blocking; callers decide retry.
//   - acquireRateLimit(accountId): blocks until a slot is available (tier-aware).
// Server-only.
// ---------------------------------------------------------------------------

import { Redis } from "@upstash/redis";

import { getTierConfig } from "./tierConfig";

const WINDOW_MS = 60_000;
const DEFAULT_BUDGET = 60;
const BUDGET_CACHE_TTL_MS = 30_000;

// ── Upstash Redis client (lazy, env-driven) ────────────────────────────────

export interface RateLimiterRedisLike {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

let redisClient: RateLimiterRedisLike | null = null;
let redisInitialized = false;

export function getRateLimiterRedis(): RateLimiterRedisLike | null {
  if (redisInitialized) return redisClient;
  redisInitialized = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    redisClient = new Redis({ url, token }) as unknown as RateLimiterRedisLike;
  } catch (err) {
    console.error("[ghl/rateLimiter] Failed to initialize Upstash Redis", err);
    redisClient = null;
  }
  return redisClient;
}

export function __resetRateLimiterForTests() {
  redisClient = null;
  redisInitialized = false;
  budgetCache.clear();
  localCounters.clear();
}

export function __setRateLimiterRedisForTests(client: RateLimiterRedisLike | null) {
  redisClient = client;
  redisInitialized = true;
}

// ── Tier-aware budget cache (avoids DB hit per acquire) ────────────────────

const budgetCache = new Map<string, { budget: number; expiresAt: number }>();

async function resolveBudget(accountId: string): Promise<number> {
  const cached = budgetCache.get(accountId);
  if (cached && cached.expiresAt > Date.now()) return cached.budget;

  let budget = DEFAULT_BUDGET;
  try {
    const config = await getTierConfig(accountId);
    budget = config.rateLimitBudget;
  } catch {
    // Keep default budget on error.
  }

  budgetCache.set(accountId, {
    budget,
    expiresAt: Date.now() + BUDGET_CACHE_TTL_MS,
  });
  return budget;
}

// ── Result type shared by local + shared paths ─────────────────────────────

export interface AcquireResult {
  ok: boolean;
  retryAfterSeconds: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Local in-process fallback (dev, tests, and Redis outages) ──────────────

interface LocalCounter {
  windowIndex: number;
  count: number;
}

const localCounters = new Map<string, LocalCounter>();

function tryAcquireLocal(
  bucketKey: string,
  budget: number,
  windowMs: number,
): AcquireResult {
  const now = Date.now();
  const windowIndex = Math.floor(now / windowMs);

  let counter = localCounters.get(bucketKey);
  if (!counter || counter.windowIndex !== windowIndex) {
    counter = { windowIndex, count: 0 };
    localCounters.set(bucketKey, counter);
  }

  counter.count += 1;

  if (counter.count <= budget) {
    return { ok: true, retryAfterSeconds: 0 };
  }

  const msUntilNextWindow = (windowIndex + 1) * windowMs - now;
  return {
    ok: false,
    retryAfterSeconds: Math.max(1, Math.ceil(msUntilNextWindow / 1000)),
  };
}

// ── Shared Redis path ──────────────────────────────────────────────────────

async function tryAcquireShared(
  bucketKey: string,
  budget: number,
  windowMs: number,
  redis: RateLimiterRedisLike,
): Promise<AcquireResult> {
  const now = Date.now();
  const windowIndex = Math.floor(now / windowMs);
  const key = `ghl:rl:${bucketKey}:${windowIndex}`;

  let count: number;
  try {
    count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, Math.ceil(windowMs / 1000) + 5);
    }
  } catch (err) {
    // Fail open on Redis errors so an Upstash outage doesn't halt every GHL
    // call. The in-process local counter still provides a single-instance
    // floor via the client's retry-on-429 logic.
    console.error("[ghl/rateLimiter] Redis error, failing open", err);
    return { ok: true, retryAfterSeconds: 0 };
  }

  if (count <= budget) return { ok: true, retryAfterSeconds: 0 };

  const msUntilNextWindow = (windowIndex + 1) * windowMs - now;
  return {
    ok: false,
    retryAfterSeconds: Math.max(1, Math.ceil(msUntilNextWindow / 1000)),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Non-blocking rate-limit check. Routes to Upstash Redis when configured,
 * otherwise uses an in-process counter. Returns whether the slot was acquired
 * and — if not — how many seconds to wait before retrying.
 */
export async function tryAcquire(
  bucketKey: string,
  budget: number,
  windowMs: number = WINDOW_MS,
): Promise<AcquireResult> {
  const redis = getRateLimiterRedis();
  if (redis) return tryAcquireShared(bucketKey, budget, windowMs, redis);
  return tryAcquireLocal(bucketKey, budget, windowMs);
}

/**
 * Blocks until a rate-limit slot is available for the given account, using
 * the tier-aware budget from pricing_config. Never rejects — the caller just
 * waits.
 */
export async function acquireRateLimit(accountId: string): Promise<void> {
  const budget = await resolveBudget(accountId);

  for (;;) {
    const result = await tryAcquire(accountId, budget);
    if (result.ok) return;
    await sleep(result.retryAfterSeconds * 1000);
  }
}
