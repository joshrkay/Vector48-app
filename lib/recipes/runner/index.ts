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

import {
  buildRecipeContext,
  type BuildRecipeContextResult,
  type RecipeContext,
  type RunnerDeps,
  type TenantAgent,
} from "./context.ts";
import { track } from "../../analytics/posthog.ts";
import { createAiPhoneAnsweringHandler } from "./recipes/aiPhoneAnswering.ts";
import { createMissedCallTextBackHandler } from "./recipes/missedCallTextBack.ts";
import { createReviewRequestHandler } from "./recipes/reviewRequest.ts";
import { createEstimateFollowUpHandler } from "./recipes/estimateFollowUp.ts";
import { createAppointmentReminderHandler } from "./recipes/appointmentReminder.ts";
import { createNewLeadInstantResponseHandler } from "./recipes/newLeadInstantResponse.ts";
import { createGoogleReviewBoosterHandler } from "./recipes/googleReviewBooster.ts";
import { createTechOnTheWayHandler } from "./recipes/techOnTheWay.ts";
import { createPostJobUpsellHandler } from "./recipes/postJobUpsell.ts";
import { createCustomerReactivationHandler } from "./recipes/customerReactivation.ts";
import { createMaintenancePlanEnrollmentHandler } from "./recipes/maintenancePlanEnrollment.ts";
import { createSeasonalDemandOutreachHandler } from "./recipes/seasonalDemandOutreach.ts";
import { createUnsoldEstimateReactivationHandler } from "./recipes/unsoldEstimateReactivation.ts";
import { createWeatherEventOutreachHandler } from "./recipes/weatherEventOutreach.ts";
import { createSeasonalCampaignHandler } from "./recipes/seasonalCampaign.ts";
import { createLeadQualificationHandler } from "./recipes/leadQualification.ts";

/**
 * Supabase-shaped interface loadActiveAgent uses. Identical to the
 * context module's shape but locally named so the two can evolve
 * independently if needed.
 */
export interface RunnerSupabaseClient {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        eq: (col: string, value: string) => {
          eq: (col: string, value: string) => {
            maybeSingle: () => Promise<{
              data: Record<string, unknown> | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
}

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
  "missed-call-text-back": createMissedCallTextBackHandler() as RecipeHandler,
  "review-request": createReviewRequestHandler() as RecipeHandler,
  "estimate-follow-up": createEstimateFollowUpHandler() as RecipeHandler,
  "appointment-reminder": createAppointmentReminderHandler() as RecipeHandler,
  "new-lead-instant-response": createNewLeadInstantResponseHandler() as RecipeHandler,
  "google-review-booster": createGoogleReviewBoosterHandler() as RecipeHandler,
  "tech-on-the-way": createTechOnTheWayHandler() as RecipeHandler,
  "post-job-upsell": createPostJobUpsellHandler() as RecipeHandler,
  "customer-reactivation": createCustomerReactivationHandler() as RecipeHandler,
  "maintenance-plan-enrollment": createMaintenancePlanEnrollmentHandler() as RecipeHandler,
  "seasonal-demand-outreach": createSeasonalDemandOutreachHandler() as RecipeHandler,
  "unsold-estimate-reactivation": createUnsoldEstimateReactivationHandler() as RecipeHandler,
  "weather-event-outreach": createWeatherEventOutreachHandler() as RecipeHandler,
  "seasonal-campaign": createSeasonalCampaignHandler() as RecipeHandler,
  "lead-qualification": createLeadQualificationHandler() as RecipeHandler,
};

export interface RunRecipeOptions {
  accountId: string;
  recipeSlug: string;
  trigger: unknown;
  /** Optional recipe_triggers.id for usage-event correlation. */
  triggerId?: string | null;
  /**
   * Dependency overrides for tests and smoke scripts. Omit in production.
   * When present, threads through to loadActiveAgent, buildRecipeContext,
   * and the tracked Anthropic client, so a single invocation runs
   * against a shimmed data layer + mocked (or real) LLM.
   */
  deps?: RunnerDeps;
}

export async function runRecipe<TResult = unknown>(
  options: RunRecipeOptions,
): Promise<TResult | Extract<BuildRecipeContextResult, { ok: false }>> {
  const { accountId, recipeSlug, trigger, triggerId, deps } = options;

  const handler = RECIPE_HANDLERS[recipeSlug] as
    | RecipeHandler<unknown, TResult>
    | undefined;
  if (!handler) {
    throw new RecipeHandlerNotRegisteredError(recipeSlug);
  }

  const agent = await loadActiveAgent(
    accountId,
    recipeSlug,
    deps?.supabase as unknown as RunnerSupabaseClient | undefined,
  );
  const startedAt = Date.now();

  const contextResult = await buildRecipeContext({
    accountId,
    agent,
    triggerId: triggerId ?? null,
    deps,
  });
  if (!contextResult.ok) {
    track(accountId, "recipe_trigger_fired", {
      slug: recipeSlug,
      latency_ms: Date.now() - startedAt,
      outcome: contextResult.outcome,
    });
    return contextResult;
  }
  const ctx = contextResult.context;
  try {
    const result = await handler(ctx, trigger);
    track(accountId, "recipe_trigger_fired", {
      slug: recipeSlug,
      latency_ms: Date.now() - startedAt,
      outcome: extractOutcome(result),
    });
    return result;
  } catch (error) {
    track(accountId, "recipe_trigger_failed", {
      slug: recipeSlug,
      latency_ms: Date.now() - startedAt,
      error:
        error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
    });
    throw error;
  }
}

function extractOutcome(result: unknown): string | null {
  if (result && typeof result === "object" && "outcome" in result) {
    const value = (result as { outcome?: unknown }).outcome;
    if (typeof value === "string") return value;
  }
  return null;
}

/**
 * Loads the tenant's editable agent row. Throws if not found or not
 * active. Exported for tests + admin tooling.
 */
export async function loadActiveAgent(
  accountId: string,
  recipeSlug: string,
  injected?: RunnerSupabaseClient,
): Promise<TenantAgent> {
  let supabase: RunnerSupabaseClient;
  if (injected) {
    supabase = injected;
  } else {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    supabase = getSupabaseAdmin() as unknown as RunnerSupabaseClient;
  }

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

  return data as unknown as TenantAgent;
}
