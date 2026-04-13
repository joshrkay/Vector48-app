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
// ---------------------------------------------------------------------------

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
 * Throws SpendCapExceededError if the agent has a cap set and is at or
 * over it. No-op when the cap is null (unlimited).
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

  if (current >= agent.monthly_spend_cap_micros) {
    throw new SpendCapExceededError(
      agent.account_id,
      agent.recipe_slug,
      agent.monthly_spend_cap_micros,
      current,
    );
  }
}

