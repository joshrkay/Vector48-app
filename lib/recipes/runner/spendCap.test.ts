import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  enforceSpendCap,
  getMonthlySpendMicros,
  SpendCapExceededError,
  type AgentSpendInfo,
  type SpendCapSupabaseClient,
} from "./spendCap.ts";

function fakeClient(
  rows: Array<{ cost_micros: number | string | null }>,
  options: { error?: { message: string } } = {},
): SpendCapSupabaseClient {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    gte: async () => ({
                      data: options.error ? null : rows,
                      error: options.error ?? null,
                    }),
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

const baseAgent: AgentSpendInfo = {
  id: "agent-1",
  account_id: "acct-1",
  recipe_slug: "ai-phone-answering",
  monthly_spend_cap_micros: 1_000_000, // $1
};

describe("getMonthlySpendMicros", () => {
  it("sums cost_micros across all matching rows", async () => {
    const client = fakeClient([
      { cost_micros: 100 },
      { cost_micros: 250 },
      { cost_micros: 50 },
    ]);
    const total = await getMonthlySpendMicros("acct-1", "ai-phone-answering", client);
    assert.equal(total, 400);
  });

  it("treats numeric strings as numbers (Postgres bigint returns string)", async () => {
    const client = fakeClient([
      { cost_micros: "1000" },
      { cost_micros: "500" },
    ]);
    const total = await getMonthlySpendMicros("acct-1", "ai-phone-answering", client);
    assert.equal(total, 1500);
  });

  it("returns 0 for an empty result set", async () => {
    const client = fakeClient([]);
    const total = await getMonthlySpendMicros("acct-1", "ai-phone-answering", client);
    assert.equal(total, 0);
  });

  it("fails open (returns 0) on a Supabase read error", async () => {
    const original = console.warn;
    console.warn = () => {};
    try {
      const client = fakeClient([], { error: { message: "boom" } });
      const total = await getMonthlySpendMicros("acct-1", "ai-phone-answering", client);
      assert.equal(total, 0);
    } finally {
      console.warn = original;
    }
  });
});

describe("enforceSpendCap", () => {
  it("is a no-op when monthly_spend_cap_micros is null (unlimited)", async () => {
    const client = fakeClient([{ cost_micros: 999_999_999 }]);
    await enforceSpendCap(
      { ...baseAgent, monthly_spend_cap_micros: null },
      client,
    );
    // No throw
  });

  it("allows the call when current spend is under the cap", async () => {
    const client = fakeClient([{ cost_micros: 500_000 }]); // half the cap
    await enforceSpendCap(baseAgent, client);
    // No throw
  });

  it("throws SpendCapExceededError when current spend equals the cap", async () => {
    const client = fakeClient([{ cost_micros: 1_000_000 }]); // exactly the cap
    await assert.rejects(
      () => enforceSpendCap(baseAgent, client),
      (err: unknown) =>
        err instanceof SpendCapExceededError &&
        err.accountId === "acct-1" &&
        err.recipeSlug === "ai-phone-answering" &&
        err.capMicros === 1_000_000 &&
        err.currentMicros === 1_000_000,
    );
  });

  it("throws SpendCapExceededError when current spend exceeds the cap", async () => {
    const client = fakeClient([
      { cost_micros: 600_000 },
      { cost_micros: 600_000 },
    ]); // 1.2 * cap
    await assert.rejects(
      () => enforceSpendCap(baseAgent, client),
      SpendCapExceededError,
    );
  });
});
