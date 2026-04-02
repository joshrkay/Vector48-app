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

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for DB assertion tests"
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type AccountRow = Record<string, unknown>;

/**
 * Returns the `accounts` row associated with the given auth email.
 * Throws if the user or account cannot be found.
 */
export async function getAccountByEmail(email: string): Promise<AccountRow> {
  const db = createAdminClient();

  const { data: userData, error: userError } =
    await db.auth.admin.getUserByEmail(email);
  if (userError || !userData?.user) {
    throw new Error(`Could not find auth user for ${email}: ${userError?.message}`);
  }

  const { data: membership, error: membershipError } = await db
    .from("account_users")
    .select("account_id")
    .eq("user_id", userData.user.id)
    .single();
  if (membershipError || !membership) {
    throw new Error(
      `Could not find account membership for user ${userData.user.id}: ${membershipError?.message}`
    );
  }

  const { data: account, error: accountError } = await db
    .from("accounts")
    .select("*")
    .eq("id", membership.account_id)
    .single();
  if (accountError || !account) {
    throw new Error(
      `Could not fetch account ${membership.account_id}: ${accountError?.message}`
    );
  }

  return account as AccountRow;
}

/**
 * Resets the test account's onboarding state so /onboarding won't
 * immediately redirect to /dashboard.
 *
 * Call this in beforeAll before navigating to /onboarding.
 */
export async function resetOnboardingState(accountId: string): Promise<void> {
  const db = createAdminClient();
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
    })
    .eq("id", accountId);
  if (error) {
    throw new Error(`Failed to reset onboarding state: ${error.message}`);
  }
}

/**
 * Re-marks the account as onboarding-complete so subsequent test runs
 * start with the same baseline state as a freshly provisioned account.
 */
export async function markOnboardingComplete(accountId: string): Promise<void> {
  const db = createAdminClient();
  const { error } = await db
    .from("accounts")
    .update({
      onboarding_step: 8,
      onboarding_done_at: new Date().toISOString(),
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", accountId);
  if (error) {
    throw new Error(`Failed to mark onboarding complete: ${error.message}`);
  }
}
