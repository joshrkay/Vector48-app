import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { RECIPE_CATALOG } from "@/lib/recipes/catalog";
import { mergeRecipesWithActivations } from "@/lib/recipes/merge";
import { RecipeGrid } from "@/components/recipes/RecipeGrid";

export default async function RecipesPage() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("id, vertical")
    .eq("owner_user_id", user.id)
    .single();

  if (!account) {
    redirect("/login");
  }

  const { data: activations } = await supabase
    .from("recipe_activations")
    .select("*")
    .eq("account_id", account.id);

  const recipes = mergeRecipesWithActivations(
    RECIPE_CATALOG,
    activations ?? [],
    account.vertical,
  );

  const activeCount = recipes.filter((r) => r.status === "active").length;
  const availableCount = recipes.filter((r) => r.status === "available").length;

  return (
    <div>
      <h1 className="font-heading text-[28px] font-bold">Your Recipes</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        {activeCount} active &middot; {availableCount} available
      </p>

      <div className="mt-6">
        <RecipeGrid recipes={recipes} />
      </div>
    </div>
  );
}
