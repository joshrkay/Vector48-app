import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { RecipeDefinition } from "@/types/recipes";
import { getRecipeBySlug } from "./utils";
import { buildRecipeConfigZodSchema } from "./configSchema";
import { catalogKeysToDbProviders } from "./catalogIntegrationMap";
import { getTierConfig } from "@/lib/ghl/tierConfig";

export type AccountProfileSlice = Pick<
  Database["public"]["Tables"]["accounts"]["Row"],
  "phone" | "voice_gender" | "voice_greeting" | "business_hours"
>;

export function getRecipeDefinitionOrThrow(
  slug: string,
): RecipeDefinition | null {
  const recipe = getRecipeBySlug(slug);
  if (!recipe) return null;
  if (recipe.releasePhase === "coming_soon") return null;
  return recipe;
}

export function validateRecipeConfig(
  recipe: RecipeDefinition,
  config: unknown,
): { ok: true; data: Record<string, unknown> } | { ok: false; message: string } {
  if (recipe.configFields.length === 0) {
    if (config && typeof config === "object" && Object.keys(config as object).length > 0) {
      return { ok: false, message: "This recipe does not accept configuration." };
    }
    return { ok: true, data: {} };
  }

  const schema = buildRecipeConfigZodSchema(recipe.configFields);
  const parsed = schema.safeParse(config);
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const msg = Object.values(first).flat()[0] ?? "Invalid configuration";
    return { ok: false, message: msg };
  }
  return { ok: true, data: parsed.data as Record<string, unknown> };
}

export async function getMissingIntegrations(
  supabase: SupabaseClient<Database>,
  accountId: string,
  requiredCatalogKeys: string[],
): Promise<string[]> {
  const providers = catalogKeysToDbProviders(requiredCatalogKeys);
  if (providers.length === 0) return [];

  const { data, error } = await supabase
    .from("integrations")
    .select("provider, status")
    .eq("account_id", accountId)
    .in("provider", providers)
    .eq("status", "connected");

  if (error) {
    console.error("[activationValidator] integrations query", error.message);
    return requiredCatalogKeys;
  }

  const connected = new Set((data ?? []).map((r) => r.provider));
  const missing: string[] = [];
  for (const key of requiredCatalogKeys) {
    const mapped = catalogKeysToDbProviders([key]);
    if (mapped.length === 0) {
      missing.push(key);
      continue;
    }
    const db = mapped[0];
    if (!connected.has(db)) missing.push(key);
  }
  return missing;
}

export async function countActiveRecipes(
  supabase: SupabaseClient<Database>,
  accountId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("recipe_activations")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("status", "active");

  if (error) {
    console.error("[activationValidator] count active", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function assertPlanAllowsMoreActivations(
  accountId: string,
  supabase: SupabaseClient<Database>,
): Promise<
  | { ok: true }
  | {
      ok: false;
      code: "PLAN_LIMIT";
      planDisplayName: string;
      message: string;
      upgradeHref: string;
    }
> {
  const tier = await getTierConfig(accountId);
  if (tier.maxActiveRecipes === null) {
    return { ok: true };
  }

  const active = await countActiveRecipes(supabase, accountId);
  if (active < tier.maxActiveRecipes) {
    return { ok: true };
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("plan_slug")
    .eq("id", accountId)
    .single();

  const planSlug = account?.plan_slug ?? "starter";

  const { data: pricing } = await supabase
    .from("pricing_config")
    .select("display_name")
    .eq("plan_slug", planSlug)
    .single();

  const planDisplayName = pricing?.display_name ?? "your current plan";

  return {
    ok: false,
    code: "PLAN_LIMIT",
    planDisplayName,
    message: `You've reached your ${planDisplayName} limit for active recipes. Upgrade to Growth for unlimited recipes.`,
    upgradeHref: "/settings?tab=billing",
  };
}
