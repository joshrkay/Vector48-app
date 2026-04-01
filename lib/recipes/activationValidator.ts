import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { RecipeDefinition } from "@/types/recipes";
import { getRecipeBySlug } from "./utils";
import { buildRecipeConfigZodSchema } from "./configSchema";
import { catalogKeysToDbProviders } from "./catalogIntegrationMap";

export type AccountProfileSlice = Pick<
  Database["public"]["Tables"]["accounts"]["Row"],
  "phone" | "voice_gender" | "greeting_text" | "business_hours"
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
    if (
      config &&
      typeof config === "object" &&
      Object.keys(config as object).length > 0
    ) {
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
    .select("provider")
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
    if (mapped.length === 0 || !connected.has(mapped[0])) {
      missing.push(key);
    }
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

export async function getExistingRecipeActivation(
  supabase: SupabaseClient<Database>,
  accountId: string,
  recipeSlug: string,
) {
  const { data, error } = await supabase
    .from("recipe_activations")
    .select("id, status, n8n_workflow_id, recipe_slug")
    .eq("account_id", accountId)
    .eq("recipe_slug", recipeSlug)
    .order("activated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[activationValidator] existing activation", error.message);
    return null;
  }

  return data;
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
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("plan_slug")
    .eq("id", accountId)
    .single();

  if (accountError || !account) {
    console.error("[activationValidator] account", accountError?.message);
    return { ok: true };
  }

  const { data: pricing } = await supabase
    .from("pricing_config")
    .select("display_name, max_active_recipes")
    .eq("plan_slug", account.plan_slug)
    .single();

  const maxActiveRecipes = pricing?.max_active_recipes ?? 3;
  if (maxActiveRecipes < 0) {
    return { ok: true };
  }

  const active = await countActiveRecipes(supabase, accountId);
  if (active < maxActiveRecipes) {
    return { ok: true };
  }

  const planDisplayName = pricing?.display_name ?? "Starter";

  return {
    ok: false,
    code: "PLAN_LIMIT",
    planDisplayName,
    message: `You've reached your ${planDisplayName} plan limit. Upgrade to Growth for unlimited recipes.`,
    upgradeHref: "/settings?tab=billing",
  };
}

export async function validateActivationRequest(
  supabase: SupabaseClient<Database>,
  accountId: string,
  recipe: RecipeDefinition,
  config: unknown,
) {
  const configResult = validateRecipeConfig(recipe, config);
  if (!configResult.ok) {
    return { ok: false as const, status: 400, error: configResult.message };
  }

  const existing = await getExistingRecipeActivation(
    supabase,
    accountId,
    recipe.slug,
  );

  if (existing?.status === "active") {
    return {
      ok: true as const,
      idempotent: true as const,
      existingActivationId: existing.id,
      config: configResult.data,
    };
  }

  const missingIntegrations = await getMissingIntegrations(
    supabase,
    accountId,
    recipe.requiredIntegrations,
  );

  if (missingIntegrations.length > 0) {
    return {
      ok: false as const,
      status: 400,
      error: "Required integrations are not connected.",
      code: "MISSING_INTEGRATIONS" as const,
      missingIntegrations,
    };
  }

  const planResult = await assertPlanAllowsMoreActivations(accountId, supabase);
  if (!planResult.ok) {
    return {
      status: 403,
      ...planResult,
    };
  }

  return {
    ok: true as const,
    idempotent: false as const,
    config: configResult.data,
  };
}
