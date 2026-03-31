import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { GHLClient } from "./client";
import { decryptToken } from "./ghlTokenCrypto";

export { decryptToken, encryptGhlToken, encryptToken } from "./ghlTokenCrypto";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase URL or service role key is not configured");
  }
  return createClient<Database>(url, serviceKey);
}

/**
 * Fetch and decrypt GHL credentials for an account.
 * Returns both `token` and `accessToken` (same value) for backward compat.
 * Does not log token material.
 */
export async function getAccountGhlCredentials(accountId: string): Promise<{
  locationId: string;
  token: string;
  accessToken: string;
}> {
  const supabase = getAdminClient();

  const { data: account, error } = await supabase
    .from("accounts")
    .select("ghl_location_id, ghl_token_encrypted")
    .eq("id", accountId)
    .single();

  if (error || !account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  if (!account.ghl_token_encrypted || !account.ghl_location_id) {
    throw new Error(`Account ${accountId} is not connected to GoHighLevel`);
  }

  const accessToken = decryptToken(account.ghl_token_encrypted);
  return {
    locationId: account.ghl_location_id,
    token: accessToken,
    accessToken,
  };
}

export async function getGHLClient(accountId: string): Promise<GHLClient> {
  const { locationId, accessToken } = await getAccountGhlCredentials(accountId);
  return GHLClient.forLocation(locationId, accessToken);
}
