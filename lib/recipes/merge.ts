import type { Vertical } from "@/types/recipes";
import type {
  RecipeCatalogEntry,
  RecipeActivationRow,
  RecipeWithStatus,
} from "./types";

/**
 * Merge the static recipe catalog with the customer's activation rows.
 *
 * Status logic:
 *  - activation exists with status "active"        → "active"
 *  - activation exists with status "paused"/"error" → "paused"
 *  - activation exists with status "deactivated" → "available" (can re-activate)
 *  - no activation + releasePhase "ga"              → "available"
 *  - no activation + releasePhase "coming_soon"     → "coming_soon"
 *
 * Sort order:
 *  1. Active — by last_triggered_at desc (nulls last)
 *  2. Paused — previously activated, now paused or errored
 *  3. Available — v1 recipes
 *  4. Coming soon — v2/v3 recipes
 */
export function mergeRecipesWithActivations(
  catalog: RecipeCatalogEntry[],
  activations: RecipeActivationRow[],
): RecipeWithStatus[] {
  const activationMap = new Map(
    activations.map((a) => [a.recipe_slug, a]),
  );

  const merged: RecipeWithStatus[] = catalog.map((entry) => {
    const activation = activationMap.get(entry.slug);

    let status: RecipeWithStatus["status"];
    if (activation && activation.status === "active") {
      status = "active";
    } else if (
      activation &&
      (activation.status === "paused" || activation.status === "error")
    ) {
      status = "paused";
    } else if (activation && activation.status === "deactivated") {
      status = "available";
    } else if (entry.releasePhase === "ga") {
      status = "available";
    } else {
      status = "coming_soon";
    }

    return {
      ...entry,
      status,
      lastTriggeredAt: activation?.last_triggered_at ?? null,
      activationId: activation?.id ?? null,
      config: activation?.config ?? null,
    };
  });

  // Sort priority: active (0), paused (1), available (2), coming_soon (3)
  const statusOrder: Record<RecipeWithStatus["status"], number> = {
    active: 0,
    paused: 1,
    error: 1,
    available: 2,
    coming_soon: 3,
  };

  return merged.sort((a, b) => {
    const oa = statusOrder[a.status];
    const ob = statusOrder[b.status];
    if (oa !== ob) return oa - ob;

    // Within active: sort by last_triggered_at desc (nulls last)
    if (a.status === "active" && b.status === "active") {
      if (a.lastTriggeredAt && b.lastTriggeredAt) {
        return b.lastTriggeredAt.localeCompare(a.lastTriggeredAt);
      }
      if (a.lastTriggeredAt) return -1;
      if (b.lastTriggeredAt) return 1;
      return 0;
    }

    // Within available: vertical-matched first, then universal, then non-matching
    if (a.status === "available" && b.status === "available") {
      const aMatch =
        a.vertical === accountVertical ? 0 : a.vertical == null ? 1 : 2;
      const bMatch =
        b.vertical === accountVertical ? 0 : b.vertical == null ? 1 : 2;
      return aMatch - bMatch;
    }

    return 0;
  });
}
