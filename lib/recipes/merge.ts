import type { RecipeDefinition } from "@/types/recipes";
import { isRecipeAvailable } from "./utils";
import type {
  RecipeActivationRow,
  RecipeWithStatus,
  Vertical,
} from "./types";

/**
 * Merge the static recipe catalog with the customer's activation rows.
 *
 * Status logic:
 *  - activation exists with status "active"        → "active"
 *  - activation exists with status "paused"/"error" → "paused" / "error"
 *  - activation exists with status "deactivated"   → "available" (if plan allows)
 *  - no activation + releasePhase "coming_soon"     → "coming_soon"
 *  - no activation + recipe available for plan      → "available"
 */
export function mergeRecipesWithActivations(
  catalog: RecipeDefinition[],
  activations: RecipeActivationRow[],
  accountVertical: Vertical,
  planSlug: string,
): RecipeWithStatus[] {
  const activationMap = new Map(
    activations.map((a) => [a.recipe_slug, a]),
  );

  const merged: RecipeWithStatus[] = catalog.map((entry) => {
    const activation = activationMap.get(entry.slug);
    const vertical = entry.vertical ?? null;

    let status: RecipeWithStatus["status"];
    if (activation && activation.status === "active") {
      status = "active";
    } else if (activation && activation.status === "error") {
      status = "error";
    } else if (activation && activation.status === "paused") {
      status = "paused";
    } else if (activation && activation.status === "deactivated") {
      status = entry.releasePhase === "coming_soon" || !isRecipeAvailable(entry, planSlug)
        ? "coming_soon"
        : "available";
    } else if (entry.releasePhase === "coming_soon") {
      status = "coming_soon";
    } else if (!isRecipeAvailable(entry, planSlug)) {
      status = "coming_soon";
    } else {
      status = "available";
    }

    return {
      ...entry,
      status,
      lastTriggeredAt: activation?.last_triggered_at ?? null,
      activationId: activation?.id ?? null,
      config: activation?.config ?? null,
    };
  });

  const statusOrder: Record<RecipeWithStatus["status"], number> = {
    active: 0,
    error: 1,
    paused: 2,
    available: 3,
    coming_soon: 4,
  };

  return merged.sort((a, b) => {
    const oa = statusOrder[a.status];
    const ob = statusOrder[b.status];
    if (oa !== ob) return oa - ob;

    if (a.status === "active" && b.status === "active") {
      if (a.lastTriggeredAt && b.lastTriggeredAt) {
        return b.lastTriggeredAt.localeCompare(a.lastTriggeredAt);
      }
      if (a.lastTriggeredAt) return -1;
      if (b.lastTriggeredAt) return 1;
      return 0;
    }

    if (a.status === "available" && b.status === "available") {
      const aMatch =
        a.vertical === accountVertical ? 0 : a.vertical === null ? 1 : 2;
      const bMatch =
        b.vertical === accountVertical ? 0 : b.vertical === null ? 1 : 2;
      return aMatch - bMatch;
    }

    return 0;
  });
}
