import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  enforceSpendCap,
  getMonthlySpendMicros,
  SpendCapExceededError,
  type AgentSpendInfo,
  type SpendCapSupabaseClient,
} from "./spendCap.ts";

interface FakeClientOptions {
  error?: { message: string };
}

function fakeClient(
  sum: number | string | null,
  options: FakeClientOptions = {},
): SpendCapSupabaseClient {
  return {
    rpc: async () => ({
      data: options.error ? null : sum,
      error: options.error ?? null,
    }),
  };
}

const baseAgent: AgentSpendInfo = {
  id: "agent-1",
  account_id: "acct-1",
  recipe_slug: "ai-phone-answering",
  monthly_spend_cap_micros: 1_000_000, // $1
};

describe("getMonthlySpendMicros", () => {
  it("returns the RPC-aggregated sum verbatim", async () => {
    const client = fakeClient(400);
    const total = await getMonthlySpendMicros("acct-1", "ai-phone-answering", client);
    assert.equal(total, 400);
  });

  it("treats numeric strings as numbers (Postgres bigint returns string)", async () => {
    const client = fakeClient("1500");
    const total = await getMonthlySpendMicros("acct-1", "ai-phone-answering", client);
    assert.equal(total, 1500);
  });

  it("returns 0 when the RPC returns null (no events yet this month)", async () => {
    const client = fakeClient(null);
    const total = await getMonthlySpendMicros("acct-1", "ai-phone-answering", client);
    assert.equal(total, 0);
  });

  it("fails open (returns 0) on a Supabase read error", async () => {
    const original = console.warn;
    console.warn = () => {};
    try {
      const client = fakeClient(null, { error: { message: "boom" } });
      const total = await getMonthlySpendMicros("acct-1", "ai-phone-answering", client);
      assert.equal(total, 0);
    } finally {
      console.warn = original;
    }
  });

  it("forwards account_id and recipe_slug to the RPC", async () => {
    let capturedArgs:
      | { p_account_id: string; p_recipe_slug: string }
      | null = null;
    const client: SpendCapSupabaseClient = {
      rpc: async (_fn, args) => {
        capturedArgs = args;
        return { data: 0, error: null };
      },
    };
    await getMonthlySpendMicros("acct-42", "lead-qualification", client);
    assert.deepEqual(capturedArgs, {
      p_account_id: "acct-42",
      p_recipe_slug: "lead-qualification",
    });
  });
});

describe("enforceSpendCap", () => {
  it("is a no-op when monthly_spend_cap_micros is null (unlimited)", async () => {
    // Even with a huge "current spend", null cap never blocks.
    const client = fakeClient(999_999_999);
    await enforceSpendCap(
      { ...baseAgent, monthly_spend_cap_micros: null },
      client,
    );
    // No throw
  });

  it("allows the call when current spend is under the cap", async () => {
    const client = fakeClient(500_000); // half the cap
    await enforceSpendCap(baseAgent, client);
    // No throw
  });

  it("throws SpendCapExceededError when current spend equals the cap", async () => {
    const client = fakeClient(1_000_000); // exactly the cap
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
    const client = fakeClient(1_200_000); // 1.2 * cap
    await assert.rejects(
      () => enforceSpendCap(baseAgent, client),
      SpendCapExceededError,
    );
  });

  it("skips the RPC call entirely when cap is null", async () => {
    let called = false;
    const client: SpendCapSupabaseClient = {
      rpc: async () => {
        called = true;
        return { data: 0, error: null };
      },
    };
    await enforceSpendCap(
      { ...baseAgent, monthly_spend_cap_micros: null },
      client,
    );
    assert.equal(called, false);
  });
});
