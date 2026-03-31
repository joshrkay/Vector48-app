import type { Database } from "@/lib/supabase/types";

export type AccountRow = Database["public"]["Tables"]["accounts"]["Row"];
export type IntegrationRow = Database["public"]["Tables"]["integrations"]["Row"];
export type PricingRow = Database["public"]["Tables"]["pricing_config"]["Row"];
