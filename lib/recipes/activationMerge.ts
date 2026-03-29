// ---------------------------------------------------------------------------
// Recipe Catalog — Activation Merge
// Combines the static recipe catalog with per-account activation rows
// from Supabase to produce the merged list used by the marketplace UI.
// ---------------------------------------------------------------------------

import type { Database } from "@/lib/supabase/types";
import type { RecipeDefinition, RecipeWithStatus } from "@/types/recipes";

type RecipeActivationRow =
  Database["public"]["Tables"]["recipe_activations"]["Row"];

/**
 * Merge the static catalog with a customer's recipe_activations rows.
 *
 * Edge cases handled:
 * - Duplicate activations for the same slug → uses the most recent by activated_at.
 * - Activation rows referencing slugs not in the catalog → silently skipped.
 * - Empty catalog or empty activations → valid inputs, no crash.
 * - null config on activation row → omitted from merged result (undefined, not null).
 */
export function mergeRecipesWithActivations(
  catalog: RecipeDefinition[],
  activations: RecipeActivationRow[],
): RecipeWithStatus[] {
  // Index activations by recipe_slug. If duplicates exist, keep the most recent.
  const activationMap = new Map<string, RecipeActivationRow>();

  for (const row of activations) {
    const existing = activationMap.get(row.recipe_slug);
    if (
      !existing ||
      new Date(row.activated_at) > new Date(existing.activated_at)
    ) {
      activationMap.set(row.recipe_slug, row);
    }
  }

  return catalog.map((recipe) => {
    const activation = activationMap.get(recipe.slug);

    if (!activation) {
      return { ...recipe };
    }

    return {
      ...recipe,
      activationStatus: activation.status,
      lastTriggeredAt: activation.last_triggered_at ?? undefined,
      config: activation.config ?? undefined,
    };
  });
}
