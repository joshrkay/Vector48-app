// ---------------------------------------------------------------------------
// Per-Agent Spend Cap Enforcement
//
// Before every Anthropic call we check the running monthly total against
// the agent's monthly_spend_cap_micros. If the cap is set and the agent is
// already over it, the call is blocked with SpendCapExceededError.
//
// This is the only mechanism preventing a runaway tenant (spammed phone
// line, prompt-injection attack, broken integration) from burning unlimited
// Claude budget.
//
// Concurrent-trigger race (qa/audits/A4-recipes.md BUG-1): two triggers
// reading at the same moment both see `current < cap` and both pass,
// then both add cost and bust the cap. We mitigate with an estimate-
// based headroom check: `current + estimatedCallCost > cap` fails
// fast so the marginal next call cannot push total spend over the cap.
// An attacker still using 100 concurrent triggers on a $3 cap will at
// worst exceed by one call's estimated cost (~$0.03 for Haiku) — a
// two-orders-of-magnitude improvement over the unbounded overage
// possible before this check.
// ---------------------------------------------------------------------------

import { computeCostMicros } from "./pricing.ts";

// getSupabaseAdmin is loaded lazily inside getMonthlySpendMicros so this
// module can be unit-tested under `node --test --experimental-strip-types`
// without pulling @supabase/supabase-js (which is not installed in the
// node-test environment) at module load time.

export class SpendCapExceededError extends Error {
  readonly accountId: string;
  readonly recipeSlug: string;
  readonly capMicros: number;
  readonly currentMicros: number;

  constructor(
    accountId: string,
    recipeSlug: string,
    capMicros: number,
    currentMicros: number,
  ) {
    super(
      `Recipe ${recipeSlug} for account ${accountId} has exceeded its monthly spend cap (${currentMicros} of ${capMicros} micros used).`,
    );
    this.name = "SpendCapExceededError";
    this.accountId = accountId;
    this.recipeSlug = recipeSlug;
    this.capMicros = capMicros;
    this.currentMicros = currentMicros;
  }
}

/** Minimum slice of a tenant_agents row that this module needs. */
export interface AgentSpendInfo {
  id: string;
  account_id: string;
  recipe_slug: string;
  monthly_spend_cap_micros: number | null;
  /**
   * Added for BUG-1: the headroom check estimates the worst-case cost
   * of the upcoming call using (model, max_tokens). Both fields live
   * on the tenant_agents row and are already part of the RecipeContext
   * the tracked client receives.
   */
  model?: string;
  max_tokens?: number;
}

/**
 * Estimate the upper bound in micros for a single Claude call, assuming
 * it consumes the agent's full max_tokens of output and a generous
 * input allowance. Used for the pre-flight headroom check so concurrent
 * triggers cannot race past a cap. Returns 0 when we can't price the
 * model (unknown slug, missing max_tokens) — matches the existing
 * fail-open behaviour of computeCostMicros.
 */
export function estimateCallCostMicros(
  model: string | undefined,
  maxTokens: number | undefined,
): number {
  if (!model || !maxTokens || maxTokens <= 0) return 0;
  // Assume ~1k input tokens as a realistic worst case for recipe
  // prompts (system + user). Output dominates cost at 3-15x input
  // pricing, so the result is still a tight upper bound.
  return computeCostMicros(model, {
    inputTokens: 1_000,
    outputTokens: maxTokens,
  });
}

/**
 * Minimal subset of the Supabase client that getMonthlySpendMicros needs.
 * Lets tests inject a fake without pulling in @supabase/supabase-js.
 *
 * We only use .rpc() — the aggregation is a SECURITY DEFINER SQL function
 * (get_monthly_spend_micros) defined in migration 00011 so the database
 * returns a single BIGINT instead of streaming every usage row to Node.
 * Runs before every Claude call, so the bandwidth savings compound.
 */
export interface SpendCapSupabaseClient {
  rpc: (
    fn: "get_monthly_spend_micros",
    args: { p_account_id: string; p_recipe_slug: string },
  ) => Promise<{
    data: number | string | null;
    error: { message: string } | null;
  }>;
}

/**
 * Returns the sum of cost_micros for this account+recipe in the current
 * calendar month (UTC). Used by enforceSpendCap and by the Usage dashboard.
 *
 * The sum happens in Postgres via get_monthly_spend_micros (migration
 * 00011). Supabase returns BIGINT values as JS numbers when small and
 * strings when they exceed Number.MAX_SAFE_INTEGER, so we normalise here.
 */
export async function getMonthlySpendMicros(
  accountId: string,
  recipeSlug: string,
  client?: SpendCapSupabaseClient,
): Promise<number> {
  let supabase: SpendCapSupabaseClient;
  if (client) {
    supabase = client;
  } else {
    const { getSupabaseAdmin } = await import("../../supabase/admin.ts");
    supabase = getSupabaseAdmin() as unknown as SpendCapSupabaseClient;
  }

  const { data, error } = await supabase.rpc("get_monthly_spend_micros", {
    p_account_id: accountId,
    p_recipe_slug: recipeSlug,
  });

  if (error) {
    // Fail-open on read errors: the tracked client will still log usage
    // post-hoc, and we'd rather serve the request than block on a Supabase
    // hiccup. Caller can switch to fail-closed by catching this module's
    // warnings in the runner.
    // eslint-disable-next-line no-console
    console.warn(
      `[recipes/runner/spendCap] failed to read usage for ${accountId}/${recipeSlug}:`,
      error,
    );
    return 0;
  }

  if (data == null) return 0;
  return Number(data);
}

/**
 * Throws SpendCapExceededError if the agent has a cap set and
 * firing the next call would exceed it. No-op when the cap is null
 * (unlimited).
 *
 * BUG-1 headroom check: we compare `current + estimatedNextCall`
 * against the cap rather than `current` alone. This bounds the
 * overage from concurrent triggers: the first N triggers that race
 * through the cap check can each add at most `estimatedNextCall` to
 * the actual spend, instead of each potentially billing many times
 * over the cap.
 */
export async function enforceSpendCap(
  agent: AgentSpendInfo,
  client?: SpendCapSupabaseClient,
): Promise<void> {
  if (agent.monthly_spend_cap_micros == null) return;

  const current = await getMonthlySpendMicros(
    agent.account_id,
    agent.recipe_slug,
    client,
  );

  const estimate = estimateCallCostMicros(agent.model, agent.max_tokens);
  const projected = current + estimate;

  if (projected >= agent.monthly_spend_cap_micros) {
    throw new SpendCapExceededError(
      agent.account_id,
      agent.recipe_slug,
      agent.monthly_spend_cap_micros,
      current,
    );
  }
}

