import { RECIPE_CATALOG } from "@/lib/recipes/catalog";
import { formatRelativeTime } from "@/lib/dashboard/formatRelativeTime";

type ActiveRecipe = {
  recipe_slug: string;
  last_triggered_at: string | null;
};

interface ActiveRecipesStripProps {
  recipes: ActiveRecipe[];
}

const recipeNameBySlug = new Map(
  RECIPE_CATALOG.map((recipe) => [recipe.slug, recipe.name]),
);

export function ActiveRecipesStrip({ recipes }: ActiveRecipesStripProps) {
  if (recipes.length === 0) {
    return (
      <section className="mt-6 rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#64748B]">
        No recipes active yet. Visit Recipes to get started.
      </section>
    );
  }

  return (
    <section className="mt-6">
      <div className="scrollbar-none flex gap-3 overflow-x-auto pb-2">
        {recipes.map((recipe) => {
          const recipeName =
            recipeNameBySlug.get(recipe.recipe_slug) ?? recipe.recipe_slug;
          const lastRan = recipe.last_triggered_at
            ? `Last ran ${formatRelativeTime(recipe.last_triggered_at)}`
            : "Not run yet";

          return (
            <div
              key={recipe.recipe_slug}
              className="flex shrink-0 items-center gap-3 rounded-full border border-[#E2E8F0] bg-white px-4 py-2"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-[#10B981]" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#0F1923]">{recipeName}</p>
                <p className="text-[11px] text-[#64748B]">{lastRan}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
