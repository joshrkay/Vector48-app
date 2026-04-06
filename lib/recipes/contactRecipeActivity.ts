import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import {
  getActivationsMatchingContactPhone,
  normalizePhoneDigits,
  type RecipeActivationRow,
} from "./phoneActivationMatch.ts";

interface GhlCredentials {
  locationId: string;
  accessToken: string;
}

interface ContactRecipeActivityOptions {
  accountId: string;
  contactId: string;
  supabase: SupabaseClient<Database>;
  ghlCredentials?: GhlCredentials;
  getCredentials?: (accountId: string) => Promise<GhlCredentials>;
  fetchContact: (contactId: string, options: { locationId: string; apiKey: string }) => Promise<{
    contact: {
      phone: string | null;
    };
  }>;
}

export interface ContactRecipeActivity {
  active: boolean;
  recipeSlugs: string[];
}

export async function listActiveRecipeActivationsForAccount(
  supabase: SupabaseClient<Database>,
  accountId: string,
): Promise<RecipeActivationRow[]> {
  const { data, error } = await supabase
    .from("recipe_activations")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "active");

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getRecipeActivityForContact({
  accountId,
  contactId,
  supabase,
  ghlCredentials,
  getCredentials,
  fetchContact,
}: ContactRecipeActivityOptions): Promise<ContactRecipeActivity> {
  if (!ghlCredentials && !getCredentials) {
    throw new Error("getCredentials is required when ghlCredentials is not provided");
  }

  const credentialsPromise = ghlCredentials
    ? Promise.resolve(ghlCredentials)
    : getCredentials!(accountId);
  const activationsPromise = listActiveRecipeActivationsForAccount(supabase, accountId);

  const credentials = await credentialsPromise;
  const [activations, contactResult] = await Promise.all([
    activationsPromise,
    fetchContact(contactId, {
      locationId: credentials.locationId,
      apiKey: credentials.accessToken,
    }),
  ]);

  const digits = normalizePhoneDigits(contactResult.contact.phone);
  const matched = getActivationsMatchingContactPhone(activations, digits);

  return {
    active: matched.length > 0,
    recipeSlugs: matched.map((activation) => activation.recipe_slug),
  };
}
