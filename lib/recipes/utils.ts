// ---------------------------------------------------------------------------
// Recipe Catalog — Utility Functions
// Pure helpers for filtering and querying the static recipe catalog.
// ---------------------------------------------------------------------------

import type {
  FunnelStage,
  RecipeCatalogEntry,
  ReleasePhase,
} from "./types";
import { RECIPE_CATALOG } from "./catalog";

/** Look up a single recipe by its unique slug. */
export function getRecipeBySlug(
  slug: string,
): RecipeCatalogEntry | undefined {
  return RECIPE_CATALOG.find((r) => r.slug === slug);
}

/** Return all recipes belonging to a funnel stage. */
export function getRecipesByStage(
  stage: FunnelStage,
): RecipeCatalogEntry[] {
  return RECIPE_CATALOG.filter((r) => r.funnelStage === stage);
}

/** Return all recipes belonging to a release phase. */
export function getRecipesByPhase(
  phase: ReleasePhase,
): RecipeCatalogEntry[] {
  return RECIPE_CATALOG.filter((r) => r.releasePhase === phase);
}

/** Return the V1 (launch-day) recipes. */
export function getV1Recipes(): RecipeCatalogEntry[] {
  return getRecipesByPhase("v1");
}

// ── Plan-based availability ────────────────────────────────────────────────
// V1 = all plans, V2 = growth+, V3 = custom only.
// Unknown plan_slug → most restrictive (V1 only).

const V2_PLANS = new Set(["growth", "custom"]);
const V3_PLANS = new Set(["custom"]);

/**
 * Check whether a recipe is available for a given pricing plan.
 * Does not check activation limits — only release-phase gating.
 */
export function isRecipeAvailable(
  recipe: RecipeCatalogEntry,
  planSlug: string,
): boolean {
  switch (recipe.releasePhase) {
    case "ga":
    case "v1":
      return true;
    case "coming_soon":
      return false;
    case "v2":
      return V2_PLANS.has(planSlug);
    case "v3":
      return V3_PLANS.has(planSlug);
    case "coming_soon":
      return false;
    default:
      return false;
  }
}
