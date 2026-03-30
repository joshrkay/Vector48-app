import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
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
    .select(
      "id, vertical, plan_slug, phone, voice_gender, voice_greeting, business_hours",
    )
    .eq("owner_user_id", user.id)
    .single();

  if (!account) {
    redirect("/login");
  }

  const { data: activations } = await supabase
    .from("recipe_activations")
    .select("*")
    .eq("account_id", account.id);

  const { data: integrationRows } = await supabase
    .from("integrations")
    .select("provider, status")
    .eq("account_id", account.id);

  const connectedProviders =
    integrationRows
      ?.filter((r) => r.status === "connected")
      .map((r) => r.provider) ?? [];

  const profile = {
    phone: account.phone,
    voice_gender: account.voice_gender,
    voice_greeting: account.voice_greeting,
    business_hours: account.business_hours,
  };

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

      <Link
        href="/recipes/estimate-audit"
        className="mt-6 flex items-start gap-4 rounded-xl border border-[var(--v48-border)] bg-card p-4 shadow-sm transition-colors hover:bg-muted/40"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--v48-accent)]/15 text-[var(--v48-accent)]">
          <ClipboardList className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <div className="min-w-0">
          <p className="font-heading text-base font-semibold">Estimate Audit</p>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Review estimates for missed line items and upsells before you send
            them — on demand, not a marketplace automation.
          </p>
        </div>
      </Link>

      <div className="mt-6">
        <RecipeGrid
          recipes={recipes}
          activeCount={activeCount}
          profile={profile}
          connectedProviders={connectedProviders}
        />
      </div>
    </div>
  );
}
