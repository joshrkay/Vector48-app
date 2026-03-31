import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getRecipeBySlug } from "@/lib/recipes/utils";
import { catalogIntegrationToDbProvider } from "@/lib/recipes/catalogIntegrationMap";

type Provider = Database["public"]["Enums"]["integration_provider"];

const CATALOG_KEYS = [
  "jobber",
  "servicetitan",
  "google_business",
  "twilio",
  "elevenlabs",
] as const;

function catalogKeyForDbProvider(provider: Provider): string | undefined {
  for (const k of CATALOG_KEYS) {
    if (catalogIntegrationToDbProvider(k) === provider) return k;
  }
  return undefined;
}

export async function getActiveRecipesRequiringProvider(
  supabase: SupabaseClient<Database>,
  accountId: string,
  provider: Provider,
): Promise<{ slug: string; name: string }[]> {
  const catalogKey = catalogKeyForDbProvider(provider);
  if (!catalogKey) return [];

  const { data: activations, error } = await supabase
    .from("recipe_activations")
    .select("recipe_slug")
    .eq("account_id", accountId)
    .eq("status", "active");

  if (error || !activations?.length) return [];

  const out: { slug: string; name: string }[] = [];
  for (const row of activations) {
    const recipe = getRecipeBySlug(row.recipe_slug);
    if (!recipe) continue;
    if (recipe.requiredIntegrations.includes(catalogKey)) {
      out.push({ slug: recipe.slug, name: recipe.name });
    }
  }
  return out;
}
