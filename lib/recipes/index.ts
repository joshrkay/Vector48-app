// ---------------------------------------------------------------------------
// Recipe Catalog — Barrel Export
// ---------------------------------------------------------------------------

export { RECIPE_CATALOG } from "./catalog";
export {
  getRecipeBySlug,
  getRecipesByStage,
  getRecipesByPhase,
  getV1Recipes,
  isRecipeAvailable,
} from "./utils";
export { mergeRecipesWithActivations } from "./activationMerge";
