import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./tierConfig", () => ({
  getTierConfig: vi.fn(),
}));

import { getTierConfig } from "./tierConfig";
import {
  __resetRateLimiterForTests,
  acquireRateLimit,
  tryAcquire,
  type RateLimiterRedisLike,
} from "./rateLimiter";

const mockedGetTierConfig = vi.mocked(getTierConfig);

async function flushMicrotasks() {
  // acquireRateLimit awaits resolveBudget (2 microtasks) before tryAcquire,
  // so pump enough cycles to drain the chain.
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

function track<T>(promise: Promise<T>): { promise: Promise<T>; done: () => boolean } {
  let done = false;
  const tracked = promise.then(
    (value) => {
      done = true;
      return value;
    },
    (reason) => {
      done = true;
      throw reason;
    },
  );
  return { promise: tracked, done: () => done };
}

describe("acquireRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T00:00:00.000Z"));
    mockedGetTierConfig.mockReset();
    __resetRateLimiterForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("allows 5 parallel acquires immediately and queues the 6th until capacity reopens", async () => {
    mockedGetTierConfig.mockResolvedValue({ rateLimitBudget: 5 } as Awaited<ReturnType<typeof getTierConfig>>);

    const accountId = "acct-parallel";
    const acquires = Array.from({ length: 6 }, () => track(acquireRateLimit(accountId)));

    await flushMicrotasks();

    expect(acquires.filter((a) => a.done()).length).toBe(5);

    await vi.advanceTimersByTimeAsync(60_000);
    await flushMicrotasks();

    await expect(Promise.all(acquires.map((a) => a.promise))).resolves.toBeDefined();
  });

  it("enforces window boundaries around 59-61 seconds", async () => {
    mockedGetTierConfig.mockResolvedValue({ rateLimitBudget: 1 } as Awaited<ReturnType<typeof getTierConfig>>);

    const accountId = "acct-boundary";
    await acquireRateLimit(accountId);

    const queued = track(acquireRateLimit(accountId));

    await flushMicrotasks();
    expect(queued.done()).toBe(false);

    await vi.advanceTimersByTimeAsync(59_000);
    await flushMicrotasks();
    expect(queued.done()).toBe(false);

    await vi.advanceTimersByTimeAsync(1_000);
    await flushMicrotasks();
    expect(queued.done()).toBe(true);

    await queued.promise;
  });

  it("releases queued requests in FIFO ordering", async () => {
    mockedGetTierConfig.mockResolvedValue({ rateLimitBudget: 1 } as Awaited<ReturnType<typeof getTierConfig>>);

    const accountId = "acct-order";
    const order: string[] = [];

    await acquireRateLimit(accountId);

    const second = acquireRateLimit(accountId).then(() => {
      order.push("second");
    });
    const third = acquireRateLimit(accountId).then(() => {
      order.push("third");
    });

    await flushMicrotasks();

    await vi.advanceTimersByTimeAsync(60_000);
    await flushMicrotasks();
    expect(order).toEqual(["second"]);

    await vi.advanceTimersByTimeAsync(60_000);
    await flushMicrotasks();
    expect(order).toEqual(["second", "third"]);

    await Promise.all([second, third]);
  });
});

describe("tryAcquire (local fallback)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T00:00:00.000Z"));
    __resetRateLimiterForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns ok until budget is exhausted, then reports retry-after", async () => {
    const key = "loc-1";
    for (let i = 0; i < 3; i++) {
      const r = await tryAcquire(key, 3, 60_000);
      expect(r.ok).toBe(true);
    }

    const blocked = await tryAcquire(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);

    vi.advanceTimersByTime(60_000);
    const afterWindow = await tryAcquire(key, 3, 60_000);
    expect(afterWindow.ok).toBe(true);
  });
});

describe("tryAcquire (shared Redis)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T00:00:00.000Z"));
    __resetRateLimiterForTests();
    process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    __resetRateLimiterForTests();
  });

  it("calls INCR + EXPIRE on first hit and just INCR after", async () => {
    const counts = new Map<string, number>();
    const incr = vi.fn(async (key: string) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    });
    const expire = vi.fn(async () => 1);
    const fakeRedis: RateLimiterRedisLike = { incr, expire };

    // Swap the lazy redis client for our fake via module state reset + env.
    // Simpler: call tryAcquireShared indirectly by forcing the lazy getter
    // to return our fake.
    const { __setRateLimiterRedisForTests } = await import("./rateLimiter");
    __setRateLimiterRedisForTests(fakeRedis);

    await tryAcquire("loc-1", 2, 60_000);
    await tryAcquire("loc-1", 2, 60_000);
    const blocked = await tryAcquire("loc-1", 2, 60_000);

    expect(incr).toHaveBeenCalledTimes(3);
    expect(expire).toHaveBeenCalledTimes(1); // only on the first INCR in a window
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("fails open when Redis throws", async () => {
    const incr = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const expire = vi.fn(async () => 1);
    const fakeRedis: RateLimiterRedisLike = { incr, expire };

    const { __setRateLimiterRedisForTests } = await import("./rateLimiter");
    __setRateLimiterRedisForTests(fakeRedis);

    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await tryAcquire("loc-1", 10, 60_000);
    expect(result.ok).toBe(true);
    expect(result.retryAfterSeconds).toBe(0);
  });
});
