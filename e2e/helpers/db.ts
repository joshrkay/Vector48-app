/**
 * Supabase admin helpers for E2E database assertion tests.
 *
 * Uses the service role key to bypass RLS so tests can read/write
 * records directly without going through the app's auth layer.
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createAdminClient } from "../../lib/supabase/admin";
import { type Database } from "../../lib/supabase/types";

export type AccountRow = Database["public"]["Tables"]["accounts"]["Row"];

export function hasDbCredentials(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Finds the auth UID for a given email by paginating through listUsers.
 * Matches the pattern used in scripts/create-test-account.mjs.
 */
async function getUserIdByEmail(email: string): Promise<string> {
  const db = createAdminClient();
  const normalized = email.toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await db.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const user = data.users.find(
      (u) => u.email?.toLowerCase() === normalized
    );
    if (user) return user.id;
    if (data.users.length < 200) break;
    page += 1;
    if (page > 50) break;
  }
  throw new Error(`No auth user found for email: ${email}`);
}

/**
 * Returns the `accounts` row associated with the given auth email.
 * Throws if the user or account cannot be found.
 */
export async function getAccountByEmail(email: string): Promise<AccountRow> {
  const db = createAdminClient();
  const userId = await getUserIdByEmail(email);

  const { data: account, error } = await db
    .from("accounts")
    .select("*")
    .eq("owner_user_id", userId)
    .single();
  if (error || !account) {
    throw new Error(
      `Could not fetch account for user ${userId}: ${error?.message}`
    );
  }
  return account;
}

/**
 * Resets the test account's onboarding state so /onboarding won't
 * immediately redirect to /dashboard.
 *
 * Also deletes any recipe_activations rows created by completeOnboarding(),
 * preventing unique-constraint failures on Playwright retries.
 *
 * Call this in beforeAll before navigating to /onboarding.
 */
export async function resetOnboardingState(email: string): Promise<void> {
  const db = createAdminClient();
  const userId = await getUserIdByEmail(email);

  // Get account id for recipe_activations cleanup
  const { data: acct } = await db
    .from("accounts")
    .select("id")
    .eq("owner_user_id", userId)
    .single();
  if (!acct) throw new Error(`No account found for ${email}`);

  // Remove recipe_activations created by completeOnboarding
  await db.from("recipe_activations").delete().eq("account_id", acct.id);

  const { error } = await db
    .from("accounts")
    .update({
      onboarding_step: 0,
      onboarding_done_at: null,
      onboarding_completed_at: null,
      ghl_provisioning_status: null,
      provisioning_status: "pending",
      business_name: "",
      phone: null,
      vertical: null,
      business_hours: null,
      voice_gender: null,
      voice_greeting: null,
      notification_contact: null,
      notification_sms: false,
      activate_recipe_1: false,
    })
    .eq("owner_user_id", userId);
  if (error) {
    throw new Error(`Failed to reset onboarding state: ${error.message}`);
  }
}

/**
 * Re-marks the account as onboarding-complete so subsequent test runs
 * start with the same baseline state as a freshly provisioned account.
 */
export async function markOnboardingComplete(email: string): Promise<void> {
  const db = createAdminClient();
  const userId = await getUserIdByEmail(email);
  const { error } = await db
    .from("accounts")
    .update({
      onboarding_step: 8,
      onboarding_done_at: new Date().toISOString(),
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("owner_user_id", userId);
  if (error) {
    throw new Error(`Failed to mark onboarding complete: ${error.message}`);
  }
}
