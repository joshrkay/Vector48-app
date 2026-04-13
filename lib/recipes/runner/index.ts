// ---------------------------------------------------------------------------
// Recipe Runner — Entry point
//
// runRecipe(accountId, recipeSlug, trigger) is the single function the rest
// of the app calls to execute an Agent SDK recipe. It:
//
//   1. Loads the tenant_agents row for (account, recipe) — enforces tenant
//      isolation at the data layer. Two tenants firing the same recipe get
//      two different agent rows, two different stack frames, no shared state.
//   2. Builds a RecipeContext (account snapshot, GHL credentials, tracked
//      Anthropic client) — every field is account-scoped.
//   3. Dispatches to the recipe handler from the RECIPE_HANDLERS registry.
//
// Phase 1 leaves RECIPE_HANDLERS empty — handlers land in Phase 2. Calling
// runRecipe before then throws RecipeHandlerNotRegisteredError so we get a
// loud failure instead of a silent no-op during shadow mode.
// ---------------------------------------------------------------------------

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildRecipeContext, type RecipeContext, type TenantAgent } from "./context";
import { createAiPhoneAnsweringHandler } from "./recipes/aiPhoneAnswering";

export class RecipeAgentNotFoundError extends Error {
  constructor(accountId: string, recipeSlug: string) {
    super(
      `No active tenant_agents row for account ${accountId} / recipe ${recipeSlug}`,
    );
    this.name = "RecipeAgentNotFoundError";
  }
}

export class RecipeHandlerNotRegisteredError extends Error {
  constructor(recipeSlug: string) {
    super(
      `No handler registered for recipe ${recipeSlug} in lib/recipes/runner/recipes/`,
    );
    this.name = "RecipeHandlerNotRegisteredError";
  }
}

/**
 * Recipe handler signature. Each Phase 2 handler exports a function with
 * this shape and registers itself in RECIPE_HANDLERS below.
 */
export type RecipeHandler<TTrigger = unknown, TResult = unknown> = (
  ctx: RecipeContext,
  trigger: TTrigger,
) => Promise<TResult>;

/**
 * Registry of recipe handlers. Phase 2 fills this out one recipe at a
 * time. Each entry is an already-bound handler function so the registry
 * stays free of factory plumbing at call sites.
 *
 * Production handlers use their module-default deps (no injected client)
 * so runRecipe calls the real Anthropic SDK, real GHL client, etc. Tests
 * build their own handlers via the factory functions in `./recipes/*`.
 */
export const RECIPE_HANDLERS: Record<string, RecipeHandler> = {
  "ai-phone-answering": createAiPhoneAnsweringHandler() as RecipeHandler,
};

export interface RunRecipeOptions {
  accountId: string;
  recipeSlug: string;
  trigger: unknown;
  /** Optional recipe_triggers.id for usage-event correlation. */
  triggerId?: string | null;
}

export async function runRecipe<TResult = unknown>(
  options: RunRecipeOptions,
): Promise<TResult> {
  const { accountId, recipeSlug, trigger, triggerId } = options;

  const handler = RECIPE_HANDLERS[recipeSlug] as
    | RecipeHandler<unknown, TResult>
    | undefined;
  if (!handler) {
    throw new RecipeHandlerNotRegisteredError(recipeSlug);
  }

  const agent = await loadActiveAgent(accountId, recipeSlug);

  const ctx = await buildRecipeContext({
    accountId,
    agent,
    triggerId: triggerId ?? null,
  });

  return handler(ctx, trigger);
}

/**
 * Loads the tenant's editable agent row. Throws if not found or not
 * active. Exported for tests + admin tooling.
 */
export async function loadActiveAgent(
  accountId: string,
  recipeSlug: string,
): Promise<TenantAgent> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tenant_agents")
    .select(
      "id, account_id, recipe_slug, display_name, system_prompt, model, max_tokens, temperature, voice_id, tool_config, monthly_spend_cap_micros, rate_limit_per_hour, status",
    )
    .eq("account_id", accountId)
    .eq("recipe_slug", recipeSlug)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load tenant agent for ${accountId}/${recipeSlug}: ${error.message}`,
    );
  }
  if (!data) {
    throw new RecipeAgentNotFoundError(accountId, recipeSlug);
  }

  return data as TenantAgent;
}
