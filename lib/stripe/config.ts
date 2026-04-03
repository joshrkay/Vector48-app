import { unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

export type PricingConfig =
  Database["public"]["Tables"]["pricing_config"]["Row"];

export const getPricingConfig = unstable_cache(
  async (): Promise<PricingConfig[]> => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("pricing_config")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");

    if (error) {
      console.error("[stripe/config] Failed to load pricing_config:", error.message);
      return [];
    }

    return data ?? [];
  },
  ["pricing_config"],
  { revalidate: 300 },
);
