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
 */
export interface SpendCapSupabaseClient {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        eq: (col: string, value: string) => {
          gte: (
            col: string,
            value: string,
          ) => Promise<{
            data: Array<{ cost_micros: number | string | null }> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}

/**
 * Returns the sum of cost_micros for this account+recipe in the current
 * calendar month (UTC). Used by enforceSpendCap and by the Usage dashboard.
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
  const monthStart = startOfUtcMonth(new Date());

  const { data, error } = await supabase
    .from("llm_usage_events")
    .select("cost_micros")
    .eq("account_id", accountId)
    .eq("recipe_slug", recipeSlug)
    .gte("created_at", monthStart.toISOString());

  if (error) {
    // Fail-open on read errors: the tracked client will still log usage
    // post-hoc, and we'd rather serve the request than block on a Supabase
    // hiccup. Caller can switch to fail-closed by checking the throw.
    // eslint-disable-next-line no-console
    console.warn(
      `[recipes/runner/spendCap] failed to read usage for ${accountId}/${recipeSlug}:`,
      error,
    );
    return 0;
  }

  return (data ?? []).reduce(
    (sum, row) => sum + Number(row.cost_micros ?? 0),
    0,
  );
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

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}
