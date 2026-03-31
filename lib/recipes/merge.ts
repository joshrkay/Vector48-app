import type { RecipeActivation, Vertical } from "@/types/recipes";
import type {
  RecipeCatalogEntry,
  RecipeActivationRow,
  RecipeWithStatus,
} from "./types";

/**
 * Merge the static recipe catalog with the customer's activation rows.
 *
 * Status logic:
 *  - activation exists with status "active"           → "active"
 *  - activation exists with status "paused" / "error" → same DB status
 *  - activation exists with status "deactivated"      → "available" (can re-activate)
 *  - no activation                                    → marketplaceListing
 *
 * Sort order:
 *  1. Active — by last_triggered_at desc (nulls last)
 *  2. Paused — previously activated, now paused or errored
 *  3. Available — vertical-matched ("recommended") first, then universal, then non-matching
 *  4. Coming soon
 */
export function mergeRecipesWithActivations(
  catalog: RecipeCatalogEntry[],
  activations: RecipeActivationRow[],
  accountVertical: Vertical,
): RecipeWithStatus[] {
  const activationMap = new Map(
    activations.map((a) => [a.recipe_slug, a]),
  );

  const merged: RecipeWithStatus[] = catalog.map((entry) => {
    const activation = activationMap.get(entry.slug);

    let activationStatus: RecipeWithStatus["activationStatus"];
    if (activation && activation.status === "active") {
      activationStatus = "active";
    } else if (
      activation &&
      (activation.status === "paused" || activation.status === "error")
    ) {
      activationStatus = activation.status;
    } else if (activation && activation.status === "deactivated") {
      activationStatus = "available";
    } else {
      activationStatus = entry.marketplaceListing;
    }

    const mappedActivation: RecipeActivation | undefined = activation
      ? {
          id: activation.id,
          account_id: activation.account_id,
          recipe_slug: activation.recipe_slug,
          status: activation.status,
          config: activation.config,
          n8n_workflow_id: activation.n8n_workflow_id,
          activated_at: activation.activated_at,
          last_triggered_at: activation.last_triggered_at,
          deactivated_at: activation.deactivated_at,
          error_message: activation.error_message,
        }
      : undefined;

    return {
      ...entry,
      activationStatus,
      activation: mappedActivation,
      lastTriggeredAt: activation?.last_triggered_at ?? null,
      config: activation?.config ?? undefined,
    };
  });

  // Sort priority: active (0), available (1), coming_soon (2)
  const statusOrder: Record<RecipeWithStatus["activationStatus"], number> = {
    active: 0,
    paused: 1,
    error: 1,
    deactivated: 2,
    available: 2,
    coming_soon: 3,
  };

  return merged.sort((a, b) => {
    const oa = statusOrder[a.activationStatus];
    const ob = statusOrder[b.activationStatus];
    if (oa !== ob) return oa - ob;

    // Within active: sort by last_triggered_at desc (nulls last)
    if (a.activationStatus === "active" && b.activationStatus === "active") {
      if (a.lastTriggeredAt && b.lastTriggeredAt) {
        return b.lastTriggeredAt.localeCompare(a.lastTriggeredAt);
      }
      if (a.lastTriggeredAt) return -1;
      if (b.lastTriggeredAt) return 1;
      return 0;
    }

    // Within available: vertical-matched first, then universal, then non-matching
    if (
      a.activationStatus === "available" &&
      b.activationStatus === "available"
    ) {
      const aMatch =
        a.vertical === accountVertical ? 0 : a.vertical == null ? 1 : 2;
      const bMatch =
        b.vertical === accountVertical ? 0 : b.vertical == null ? 1 : 2;
      return aMatch - bMatch;
    }

    return 0;
  });
}
