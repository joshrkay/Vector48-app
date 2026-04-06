export type DeactivateRecipePayload = {
  recipe_id?: string;
  account_id?: string;
};

export type ParsedDeactivateRecipe =
  | { ok: true; recipeId: string; accountId: string }
  | { ok: false; error: string };

export function parseDeactivateRecipePayload(payload: unknown): ParsedDeactivateRecipe {
  if (payload === null || typeof payload !== "object") {
    return { ok: false, error: "Invalid JSON body" };
  }

  const body = payload as DeactivateRecipePayload;
  const recipeId = body.recipe_id?.trim();
  const accountId = body.account_id?.trim();

  if (!recipeId || !accountId) {
    return { ok: false, error: "recipe_id and account_id are required" };
  }

  return { ok: true, recipeId, accountId };
}
