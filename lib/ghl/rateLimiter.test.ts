import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./tierConfig", () => ({
  getTierConfig: vi.fn(),
}));

import { getTierConfig } from "./tierConfig";
import { acquireRateLimit } from "./rateLimiter";

const mockedGetTierConfig = vi.mocked(getTierConfig);

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("acquireRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T00:00:00.000Z"));
    mockedGetTierConfig.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("allows 5 parallel acquires immediately and queues the 6th until capacity reopens", async () => {
    mockedGetTierConfig.mockResolvedValue({ rateLimitBudget: 5 } as Awaited<ReturnType<typeof getTierConfig>>);

    const accountId = "acct-parallel";
    const acquires = Array.from({ length: 6 }, () => acquireRateLimit(accountId));

    await flushMicrotasks();

    const settledBeforeWindow = await Promise.all(acquires.map(async (p) => ({
      done: await Promise.race([p.then(() => true), Promise.resolve(false)]),
    })));

    expect(settledBeforeWindow.filter((r) => r.done).length).toBe(5);

    vi.advanceTimersByTime(60_000);
    await flushMicrotasks();

    await expect(Promise.all(acquires)).resolves.toBeDefined();
  });

  it("enforces window boundaries around 59-61 seconds", async () => {
    mockedGetTierConfig.mockResolvedValue({ rateLimitBudget: 1 } as Awaited<ReturnType<typeof getTierConfig>>);

    const accountId = "acct-boundary";
    await acquireRateLimit(accountId);

    let released = false;
    const queued = acquireRateLimit(accountId).then(() => {
      released = true;
    });

    await flushMicrotasks();
    expect(released).toBe(false);

    vi.advanceTimersByTime(59_000);
    await flushMicrotasks();
    expect(released).toBe(false);

    vi.advanceTimersByTime(1_000);
    await flushMicrotasks();
    expect(released).toBe(true);

    await queued;
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

    vi.advanceTimersByTime(60_000);
    await flushMicrotasks();
    expect(order).toEqual(["second"]);

    vi.advanceTimersByTime(60_000);
    await flushMicrotasks();
    expect(order).toEqual(["second", "third"]);

    await Promise.all([second, third]);
  });
});
