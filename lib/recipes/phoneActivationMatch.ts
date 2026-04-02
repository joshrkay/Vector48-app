import type { Database } from "@/lib/supabase/types";

export type RecipeActivationRow = Database["public"]["Tables"]["recipe_activations"]["Row"];

export function normalizePhoneDigits(phone: string | null | undefined): string {
  return String(phone ?? "").replace(/\D/g, "");
}

/** Match CRM contact phone to activation `config.phone` (digits only), same as contact detail page. */
export function getActivationsMatchingContactPhone(
  activations: RecipeActivationRow[],
  contactPhoneDigits: string,
): RecipeActivationRow[] {
  if (contactPhoneDigits.length === 0) return [];
  return activations.filter((ra) => {
    const cfg = ra.config as Record<string, unknown> | null;
    const raDigits = normalizePhoneDigits(String(cfg?.phone ?? ""));
    return raDigits.length > 0 && raDigits === contactPhoneDigits;
  });
}
