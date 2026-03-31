import type { Database } from "@/lib/supabase/types";

export type IntegrationProviderDb =
  Database["public"]["Enums"]["integration_provider"];

/** Maps catalog `requiredIntegrations` string keys to DB enum values. */
const CATALOG_TO_DB: Partial<Record<string, IntegrationProviderDb>> = {
  google_business: "google_business",
  jobber: "jobber",
  servicetitan: "servicetitan",
};

export function catalogIntegrationToDbProvider(
  key: string,
): IntegrationProviderDb | undefined {
  return CATALOG_TO_DB[key];
}

export function catalogKeysToDbProviders(
  keys: string[],
): IntegrationProviderDb[] {
  const out: IntegrationProviderDb[] = [];
  for (const k of keys) {
    const p = catalogIntegrationToDbProvider(k);
    if (p) out.push(p);
  }
  return out;
}
