import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getActiveRecipesRequiringProvider } from "@/lib/settings/recipesDependingOnProvider";

const TILE_PROVIDERS = [
  "jobber",
  "servicetitan",
  "google_business",
] as const satisfies readonly Database["public"]["Enums"]["integration_provider"][];

export type IntegrationWarningMap = Record<
  (typeof TILE_PROVIDERS)[number],
  boolean
>;

export async function computeIntegrationWarnings(
  supabase: SupabaseClient<Database>,
  accountId: string,
): Promise<IntegrationWarningMap> {
  const { data: integrations } = await supabase
    .from("integrations")
    .select("provider, status")
    .eq("account_id", accountId);

  const connected = new Set(
    (integrations ?? [])
      .filter((i) => i.status === "connected")
      .map((i) => i.provider),
  );

  const result: IntegrationWarningMap = {
    jobber: false,
    servicetitan: false,
    google_business: false,
  };

  for (const p of TILE_PROVIDERS) {
    if (connected.has(p)) continue;
    const deps = await getActiveRecipesRequiringProvider(
      supabase,
      accountId,
      p,
    );
    result[p] = deps.length > 0;
  }

  return result;
}
