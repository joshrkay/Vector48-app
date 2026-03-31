import type { FunnelStage } from "@/types/recipes";
import { RECIPE_CATALOG } from "@/lib/recipes/catalog";

const STAGE_DOT: Record<FunnelStage, string> = {
  capture: "bg-teal-500",
  engage: "bg-violet-500",
  close: "bg-amber-500",
  deliver: "bg-green-500",
  retain: "bg-rose-500",
  reactivate: "bg-orange-500",
};

const DEFAULT_DOT = "bg-slate-500";

/**
 * Tailwind bg class for activity feed dot from recipe slug.
 */
export function getStageDotClass(recipeSlug: string | null): string {
  if (!recipeSlug) return DEFAULT_DOT;
  const recipe = RECIPE_CATALOG.find((r) => r.slug === recipeSlug);
  if (!recipe) return DEFAULT_DOT;
  return STAGE_DOT[recipe.funnelStage] ?? DEFAULT_DOT;
}
