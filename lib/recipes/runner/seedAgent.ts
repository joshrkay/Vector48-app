// ---------------------------------------------------------------------------
// Tenant Agent Seeding
//
// When a tenant activates an Agent-SDK recipe, we copy the operator-
// authored archetype defaults into a tenant_agents row, resolving
// {{business_name}} / {{vertical}} / {{greeting_name}} placeholders
// against the account. The tenant then edits their copy via the Agents
// dashboard; the archetype itself is never mutated.
//
// This runs from the activation API (`/api/recipes/activate`) and from
// the Phase 5 backfill script. Both paths use the service role, which
// bypasses RLS and the tenant_agents_protect_immutable trigger, so we
// can write `id`, `account_id`, `recipe_slug`, and `tool_config`
// directly.
//
// Reuses archetypes from `lib/recipes/runner/archetypes.ts` — the
// runner and the activation API share the same single source of truth.
// ---------------------------------------------------------------------------

import {
  getArchetype,
  resolveSystemPrompt,
  type ArchetypeAccount,
  type RecipeArchetype,
} from "./archetypes.ts";

/**
 * Minimal Supabase shape used by seedAgentFromArchetype. Supports:
 *  - Looking up an account by id: `from("accounts").select(...).eq("id", X).maybeSingle()`
 *  - Looking up an existing tenant_agents row by composite key:
 *    `from("tenant_agents").select(...).eq("account_id", X).eq("recipe_slug", Y).maybeSingle()`
 *  - Inserting a new tenant_agents row returning the created row:
 *    `from("tenant_agents").insert(row).select(cols).single()`
 *
 * We intentionally do NOT use `.upsert(...).onConflict(...).DO UPDATE` because
 * that clobbers tenant edits on re-run. This module's contract is
 * "seed-only-when-missing" so operator re-runs and the activation path
 * preserve any subsequent tenant edits to system_prompt, model, voice,
 * or spend cap.
 */
export interface SeedSupabaseClient {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        maybeSingle: () => Promise<{
          data: (ArchetypeAccountRow | SeededAgentRow) | null;
          error: { message: string } | null;
        }>;
        eq: (col: string, value: string) => {
          maybeSingle: () => Promise<{
            data: SeededAgentRow | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
    insert: (
      row: TenantAgentInsert,
    ) => {
      select: (cols: string) => {
        single: () => Promise<{
          data: SeededAgentRow | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

interface ArchetypeAccountRow {
  id: string;
  business_name: string | null;
  vertical: string | null;
  greeting_name: string | null;
}

export interface TenantAgentInsert {
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
  status: "active";
}

export interface SeededAgentRow extends TenantAgentInsert {
  id: string;
}

export class UnknownRecipeArchetypeError extends Error {
  readonly recipeSlug: string;
  constructor(recipeSlug: string) {
    super(`No archetype registered for recipe ${recipeSlug}`);
    this.name = "UnknownRecipeArchetypeError";
    this.recipeSlug = recipeSlug;
  }
}

export class SeedAccountNotFoundError extends Error {
  readonly accountId: string;
  constructor(accountId: string) {
    super(`Cannot seed agent — account ${accountId} not found`);
    this.name = "SeedAccountNotFoundError";
    this.accountId = accountId;
  }
}

export interface SeedAgentOptions {
  accountId: string;
  recipeSlug: string;
  /**
   * Per-activation overrides merged into the seeded row. Useful when the
   * activation API wants to stamp `tool_config.notification_contact_id`
   * or set a plan-specific spend cap at insert time. Never used to
   * override `account_id`, `recipe_slug`, or `id`.
   */
  overrides?: Partial<
    Pick<
      TenantAgentInsert,
      | "system_prompt"
      | "display_name"
      | "model"
      | "max_tokens"
      | "temperature"
      | "voice_id"
      | "tool_config"
      | "monthly_spend_cap_micros"
      | "rate_limit_per_hour"
    >
  >;
}

export interface SeedAgentDeps {
  client?: SeedSupabaseClient;
  /** Override the archetype registry, used by tests. */
  getArchetype?: (slug: string) => RecipeArchetype | null;
}

/**
 * Ensures a tenant_agents row exists for `(accountId, recipeSlug)`,
 * seeded from the archetype defaults. If a row already exists, it is
 * returned unchanged — tenant edits to `system_prompt`, `model`,
 * `voice_id`, `monthly_spend_cap_micros`, etc. are preserved.
 *
 * This "seed-only-when-missing" semantic is the real contract the
 * activation route and the Phase 5 backfill script rely on. Re-running
 * either is safe and does not overwrite tenant state.
 *
 * To *force* a reseed (e.g. an operator-triggered "Reset to defaults"
 * button), call this helper after deleting the existing row, or use a
 * separate function that performs the delete + insert in a single
 * transaction.
 */
export async function seedAgentFromArchetype(
  options: SeedAgentOptions,
  deps: SeedAgentDeps = {},
): Promise<SeededAgentRow> {
  const archetypeLookup = deps.getArchetype ?? getArchetype;
  const archetype = archetypeLookup(options.recipeSlug);
  if (!archetype) {
    throw new UnknownRecipeArchetypeError(options.recipeSlug);
  }

  let supabase: SeedSupabaseClient;
  if (deps.client) {
    supabase = deps.client;
  } else {
    const { getSupabaseAdmin } = await import("../../supabase/admin.ts");
    supabase = getSupabaseAdmin() as unknown as SeedSupabaseClient;
  }

  // Step 1: return any pre-existing row untouched. This is the tenant-
  // edit preservation path — the row we fetch already reflects every
  // subsequent mutation from the admin UI or the reset endpoint.
  const existingLookup = supabase
    .from("tenant_agents")
    .select(
      "id, account_id, recipe_slug, display_name, system_prompt, model, max_tokens, temperature, voice_id, tool_config, monthly_spend_cap_micros, rate_limit_per_hour, status",
    )
    .eq("account_id", options.accountId);
  const { data: existing, error: existingError } = await existingLookup
    .eq("recipe_slug", options.recipeSlug)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `Failed to look up existing tenant_agents row for ${options.accountId}/${options.recipeSlug}: ${existingError.message}`,
    );
  }
  if (existing) {
    return existing as SeededAgentRow;
  }

  // Step 2: no row yet — seed from the archetype. Resolve placeholders
  // against the account row first.
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, business_name, vertical, greeting_name")
    .eq("id", options.accountId)
    .maybeSingle();

  if (accountError) {
    throw new Error(
      `Failed to load account ${options.accountId} while seeding agent: ${accountError.message}`,
    );
  }
  if (!account) {
    throw new SeedAccountNotFoundError(options.accountId);
  }
  const accountRow = account as ArchetypeAccountRow;

  const resolvedPrompt = resolveSystemPrompt(archetype.systemPrompt, {
    business_name: accountRow.business_name,
    vertical: accountRow.vertical,
    greeting_name: accountRow.greeting_name,
  } satisfies ArchetypeAccount);

  const row: TenantAgentInsert = {
    account_id: options.accountId,
    recipe_slug: options.recipeSlug,
    display_name: options.overrides?.display_name ?? archetype.displayName,
    system_prompt: options.overrides?.system_prompt ?? resolvedPrompt,
    model: options.overrides?.model ?? archetype.model,
    max_tokens: options.overrides?.max_tokens ?? archetype.maxTokens,
    temperature:
      options.overrides?.temperature ?? archetype.temperature ?? null,
    voice_id: options.overrides?.voice_id ?? archetype.voiceId ?? null,
    tool_config: mergeToolConfig(
      archetype.toolConfig,
      options.overrides?.tool_config,
    ),
    monthly_spend_cap_micros:
      options.overrides?.monthly_spend_cap_micros ??
      archetype.monthlySpendCapMicros,
    rate_limit_per_hour:
      options.overrides?.rate_limit_per_hour ?? archetype.rateLimitPerHour,
    status: "active",
  };

  // Plain INSERT (not upsert). If a concurrent writer beats us to it we
  // surface the unique_violation via the error path — in practice both
  // callers (activation route, backfill script) serialise per-account
  // so the race is cosmetic.
  const returningCols =
    "id, account_id, recipe_slug, display_name, system_prompt, model, max_tokens, temperature, voice_id, tool_config, monthly_spend_cap_micros, rate_limit_per_hour, status";
  const { data: inserted, error: insertError } = await supabase
    .from("tenant_agents")
    .insert(row)
    .select(returningCols)
    .single();

  if (insertError) {
    throw new Error(
      `Failed to seed tenant_agents row for ${options.accountId}/${options.recipeSlug}: ${insertError.message}`,
    );
  }
  if (!inserted) {
    throw new Error(
      `seedAgentFromArchetype returned no row for ${options.accountId}/${options.recipeSlug}`,
    );
  }

  return inserted as SeededAgentRow;
}

/**
 * Merges operator-controlled archetype tool_config with per-activation
 * overrides. Overrides take precedence at the top level only (shallow
 * merge) — nested tool-specific settings should live at the top.
 *
 * In practice the only expected override today is
 * `notification_contact_id` for ai-phone-answering, which the activation
 * API writes when the caller selects an owner notification contact.
 */
function mergeToolConfig(
  archetypeConfig: Record<string, unknown>,
  overrideConfig: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!overrideConfig) return { ...archetypeConfig };
  return { ...archetypeConfig, ...overrideConfig };
}
