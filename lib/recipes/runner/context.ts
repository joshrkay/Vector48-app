// ---------------------------------------------------------------------------
// Recipe Context
//
// Per-invocation state passed to recipe handlers. Loaded fresh for every
// runRecipe() call so two tenants firing the same recipe simultaneously
// never share any state — the entire object is local to its stack frame.
//
// Loads:
//   - The account row (business_name, vertical, plan, voice settings, etc.)
//   - GHL credentials via getAccountGhlCredentials() — single chokepoint
//   - A spend-cap-aware Anthropic client bound to (account, agent)
// ---------------------------------------------------------------------------

import {
  createTrackedAnthropic,
  type TrackedAnthropic,
  type TrackedClientOptions,
  type TrackedClientSupabase,
} from "./trackedClient.ts";

/**
 * Raised by buildRecipeContext when the account has no GHL OAuth
 * connection (revoked, never connected, mid-flight disconnect). The
 * runner catches this and converts it to a `skipped_no_ghl_creds`
 * outcome so the trigger row records the miss without a 500. See
 * qa/audits/A4-recipes.md BUG-2.
 */
export class RecipeMissingGhlCredsError extends Error {
  readonly accountId: string;

  constructor(accountId: string) {
    super(`No GHL credentials for account ${accountId}`);
    this.name = "RecipeMissingGhlCredsError";
    this.accountId = accountId;
  }
}

export interface TenantAgent {
  id: string;
  account_id: string;
  recipe_slug: string;
  display_name: string;
  system_prompt: string;
  model: string;
  max_tokens: number;
  temperature: number | null;
  voice_id: string | null;
  tool_config: Record<string, unknown>;
  monthly_spend_cap_micros: number | null;
  rate_limit_per_hour: number | null;
  status: "active" | "paused" | "disabled";
}

export interface AccountSnapshot {
  id: string;
  business_name: string;
  vertical: string | null;
  plan_slug: string | null;
  greeting_name: string | null;
  notification_contact_phone: string | null;
}

export interface RecipeContext {
  accountId: string;
  agent: TenantAgent;
  account: AccountSnapshot;
  ghl: {
    locationId: string;
    accessToken: string;
  };
  ai: TrackedAnthropic;
  /** Trigger correlation id propagated through to llm_usage_events. */
  triggerId: string | null;
}

/**
 * Dependencies the context builder uses to reach the outside world.
 * Production code passes none of these (default implementations in
 * `defaultRunnerDeps` do the real thing). Integration tests and smoke
 * scripts pass shims for the Supabase client, the GHL credentials
 * loader, and optionally the Anthropic client so the runner can be
 * exercised against a local Postgres or a mocked LLM without
 * monkey-patching module state.
 */
export interface RunnerDeps {
  /**
   * Supabase-shaped client used to fetch the account row in
   * buildRecipeContext and (elsewhere) to load the tenant_agents row +
   * insert llm_usage_events. The production default is
   * getSupabaseAdmin() from @/lib/supabase/admin.
   */
  supabase?: SupabaseContextClient;
  /**
   * Loader for the per-account GHL credentials. Production default
   * is getAccountGhlCredentials(accountId) from @/lib/ghl/token, which
   * decrypts the OAuth token and returns it alongside the locationId.
   */
  getGhlCredentials?: (
    accountId: string,
  ) => Promise<{ locationId: string; accessToken: string }>;
  /**
   * Override for the underlying Anthropic SDK instance. Used by the
   * tracked client so smoke scripts can inject a mocked LLM without
   * disabling spend-cap + usage-event logging.
   */
  anthropic?: TrackedClientOptions["client"];
}

/**
 * Minimal Supabase-shaped interface that buildRecipeContext needs.
 * Both the real @supabase/supabase-js client and the pg-backed shim
 * used in smoke scripts satisfy this type.
 */
export interface SupabaseContextClient {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

export interface BuildContextOptions {
  accountId: string;
  agent: TenantAgent;
  triggerId?: string | null;
  /**
   * Dependency overrides. Omit in production. Integration tests and
   * scripts pass a shimmed Supabase client + GHL credential loader.
   */
  deps?: RunnerDeps;
}

export async function buildRecipeContext(
  options: BuildContextOptions,
): Promise<RecipeContext> {
  const { accountId, agent } = options;

  if (agent.account_id !== accountId) {
    throw new Error(
      `Agent ${agent.id} belongs to account ${agent.account_id}, not ${accountId}`,
    );
  }
  if (agent.status !== "active") {
    throw new Error(
      `Agent ${agent.id} (${agent.recipe_slug}) is not active: status=${agent.status}`,
    );
  }

  const supabase =
    options.deps?.supabase ??
    ((
      await import("@/lib/supabase/admin")
    ).getSupabaseAdmin() as unknown as SupabaseContextClient);

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select(
      "id, business_name, vertical, plan_slug, greeting_name, notification_contact_phone",
    )
    .eq("id", accountId)
    .maybeSingle();

  if (accountError || !account) {
    throw new Error(
      `Account ${accountId} not found while building recipe context: ${accountError?.message ?? "no row"}`,
    );
  }

  const getGhlCredentials =
    options.deps?.getGhlCredentials ??
    (async (id: string) => {
      const { getAccountGhlCredentials } = await import("@/lib/ghl/token");
      const creds = await getAccountGhlCredentials(id);
      if (!creds) {
        throw new RecipeMissingGhlCredsError(id);
      }
      return { locationId: creds.locationId, accessToken: creds.accessToken };
    });

  let ghl: { locationId: string; accessToken: string };
  try {
    ghl = await getGhlCredentials(accountId);
  } catch (err) {
    // Rethrow as the typed error so runRecipe can swallow it into a
    // graceful skipped outcome instead of bubbling a 500. Unexpected
    // errors (network, decrypt) still propagate.
    if (err instanceof RecipeMissingGhlCredsError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (/no ghl credentials/i.test(msg)) {
      throw new RecipeMissingGhlCredsError(accountId);
    }
    throw err;
  }

  const ai = createTrackedAnthropic({
    accountId,
    recipeSlug: agent.recipe_slug,
    agent,
    triggerId: options.triggerId ?? null,
    client: options.deps?.anthropic,
    // Pass the shimmed supabase through so the tracked client writes
    // llm_usage_events against the same data layer as the rest of the
    // runner in test/smoke mode. The shapes overlap on `.from(table)`
    // and both the TrackedClientSupabase and SupabaseContextClient
    // shims used here implement the insert path the tracked client
    // needs, but TypeScript can't prove it structurally because
    // SupabaseContextClient only declares the select chain.
    supabase: options.deps?.supabase as unknown as
      | TrackedClientSupabase
      | undefined,
  });

  return {
    accountId,
    agent,
    account: account as unknown as AccountSnapshot,
    ghl: {
      locationId: ghl.locationId,
      accessToken: ghl.accessToken,
    },
    ai,
    triggerId: options.triggerId ?? null,
  };
}
