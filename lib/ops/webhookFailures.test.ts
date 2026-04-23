import { beforeEach, describe, expect, it, vi } from "vitest";

// The admin client is created inside each function call via import, so we
// mock the module globally and inspect the query builder.

const createChain = (rows: Array<Record<string, unknown>>) => {
  const chain: Record<string, unknown> = {
    eq: vi.fn(),
    gte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    select: vi.fn(),
    then: undefined as unknown,
  };
  chain.eq = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  // Make the chain awaitable — the final call in our code is .limit()
  // returning a thenable that resolves with { data, error }.
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: rows, error: null });
  return chain;
};

const createCountChain = (count: number) => {
  const chain: Record<string, unknown> = {
    eq: vi.fn(),
    gte: vi.fn(),
    select: vi.fn(),
    then: undefined as unknown,
  };
  chain.eq = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    resolve({ count, error: null });
  return chain;
};

const fromCalls: Array<{ table: string; chain: Record<string, unknown> }> = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain = fromCalls.length > 0 ? fromCalls[0].chain : createChain([]);
      fromCalls.push({ table, chain });
      return chain;
    },
  }),
}));

describe("listWebhookFailures", () => {
  beforeEach(() => {
    fromCalls.length = 0;
    vi.resetModules();
  });

  it("returns rows ordered by created_at desc with default limit 100", async () => {
    const rows = [
      { id: "a", provider: "ghl", account_id: null, reason: "bad sig", event_type: null, payload_hash: null, created_at: "2026-01-01T00:00:00Z" },
    ];
    fromCalls.push({ table: "webhook_failures", chain: createChain(rows) });

    const { listWebhookFailures } = await import("./webhookFailures");
    const result = await listWebhookFailures();

    expect(result).toEqual(rows);
    const chain = fromCalls[0].chain as Record<string, ReturnType<typeof vi.fn>>;
    expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(100);
  });

  it("caps limit at 500 so a malicious caller can't scrape the whole table", async () => {
    fromCalls.push({ table: "webhook_failures", chain: createChain([]) });
    const { listWebhookFailures } = await import("./webhookFailures");
    await listWebhookFailures({ limit: 9999 });
    const chain = fromCalls[0].chain as Record<string, ReturnType<typeof vi.fn>>;
    expect(chain.limit).toHaveBeenCalledWith(500);
  });

  it("enforces a minimum limit of 1 even if the caller passes 0 or negative", async () => {
    fromCalls.push({ table: "webhook_failures", chain: createChain([]) });
    const { listWebhookFailures } = await import("./webhookFailures");
    await listWebhookFailures({ limit: -5 });
    const chain = fromCalls[0].chain as Record<string, ReturnType<typeof vi.fn>>;
    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  it("filters by provider when one is specified", async () => {
    fromCalls.push({ table: "webhook_failures", chain: createChain([]) });
    const { listWebhookFailures } = await import("./webhookFailures");
    await listWebhookFailures({ provider: "stripe" });
    const chain = fromCalls[0].chain as Record<string, ReturnType<typeof vi.fn>>;
    expect(chain.eq).toHaveBeenCalledWith("provider", "stripe");
  });

  it("swallows DB errors and returns [] so the ops UI renders an empty state instead of crashing", async () => {
    const errorChain: Record<string, unknown> = {
      eq: vi.fn(),
      gte: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      select: vi.fn(),
      then: (resolve: (v: unknown) => unknown) =>
        resolve({ data: null, error: { message: "boom" } }),
    };
    errorChain.eq = vi.fn(() => errorChain);
    errorChain.gte = vi.fn(() => errorChain);
    errorChain.order = vi.fn(() => errorChain);
    errorChain.limit = vi.fn(() => errorChain);
    errorChain.select = vi.fn(() => errorChain);
    fromCalls.push({ table: "webhook_failures", chain: errorChain });

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { listWebhookFailures } = await import("./webhookFailures");
    const result = await listWebhookFailures();

    expect(result).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe("summarizeWebhookFailures", () => {
  beforeEach(() => {
    fromCalls.length = 0;
    vi.resetModules();
  });

  it("returns three bucketed counts (24h, 7d, 30d)", async () => {
    fromCalls.push({ table: "webhook_failures", chain: createCountChain(3) });
    fromCalls.push({ table: "webhook_failures", chain: createCountChain(12) });
    fromCalls.push({ table: "webhook_failures", chain: createCountChain(40) });

    // Consume chains one per Promise.all entry. The mock pops index 0 each
    // from() call, so we need each entry distinct — override from() to index.
    let idx = 0;
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: () => {
          const current = fromCalls[idx]?.chain ?? createCountChain(0);
          idx += 1;
          return current;
        },
      }),
    }));
    const { summarizeWebhookFailures } = await import("./webhookFailures");
    const result = await summarizeWebhookFailures();
    expect(result).toEqual({ last24h: 3, last7d: 12, last30d: 40 });
  });
});
