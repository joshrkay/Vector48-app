import { RECIPE_CATALOG } from "@/lib/recipes/catalog";
import { getRecipeEngine } from "@/lib/recipes/engineRegistry";

/**
 * Authoritative list of launch-enabled Agent SDK recipe slugs.
 *
 * Source of truth:
 *  - catalog release gates (`releasePhase !== "coming_soon"`)
 *  - engine routing (`engineRegistry` => `agent-sdk`)
 */
export const LAUNCH_ENABLED_AGENT_SDK_SLUGS = RECIPE_CATALOG
  .filter((recipe) => recipe.releasePhase !== "coming_soon")
  .filter((recipe) => getRecipeEngine(recipe.slug) === "agent-sdk")
  .map((recipe) => recipe.slug)
  .sort();
