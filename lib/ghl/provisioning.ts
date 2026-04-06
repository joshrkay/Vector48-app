import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { provisionGHL } from "@/lib/jobs/provisionGHL";

/**
 * @deprecated Canonical provisioning orchestration lives in
 * `lib/jobs/provisionGHL.ts`.
 *
 * This module is intentionally kept as a compatibility layer so older
 * imports (e.g. Inngest functions) can continue using the previous API
 * without duplicating provisioning logic.
 */

export interface ProvisionResult {
  success: boolean;
  error?: string;
  ghl_sub_account_id?: string;
  ghl_voice_agent_id?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function getAccountProvisioningSnapshot(accountId: string): Promise<{
  ghl_location_id: string | null;
  ghl_voice_agent_id: string | null;
}> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("accounts")
    .select("ghl_location_id, ghl_voice_agent_id")
    .eq("id", accountId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read provisioning snapshot: ${error.message}`);
  }

  return {
    ghl_location_id: data?.ghl_location_id ?? null,
    ghl_voice_agent_id: data?.ghl_voice_agent_id ?? null,
  };
}

function formatCompatError(step: string | undefined, message: string): string {
  if (!step) return message;
  return `${step}: ${message}`;
}

// ── Compatibility wrapper ──────────────────────────────────────────────────

/**
 * Provision a customer's GHL infrastructure after onboarding completion.
 *
 * This is a thin compatibility wrapper over the canonical orchestrator in
 * `lib/jobs/provisionGHL.ts` that preserves the historical return shape.
 *
 * This function never throws. Callers should check the returned status.
 */
export async function provisionCustomer(
  accountId: string,
): Promise<ProvisionResult> {
  const result = await provisionGHL(accountId);

  const snapshot = await getAccountProvisioningSnapshot(accountId);

  if (!result.success) {
    return {
      success: false,
      error: formatCompatError(result.failedStep, result.error),
      ghl_sub_account_id: snapshot.ghl_location_id ?? undefined,
      ghl_voice_agent_id: snapshot.ghl_voice_agent_id ?? undefined,
    };
  }

  return {
    success: true,
    ghl_sub_account_id: snapshot.ghl_location_id ?? undefined,
    ghl_voice_agent_id: snapshot.ghl_voice_agent_id ?? undefined,
  };
}

/**
 * On-demand provisioning entry point used by `/api/onboarding/provision-ghl`.
 *
 * This is now a thin wrapper over the canonical orchestrator to keep the
 * historical return shape stable for callers that still import from this
 * module.
 */
export async function provisionGhlSubAccountForAccount(input: {
  accountId: string;
  ownerEmail?: string;
}): Promise<{ locationId: string; usedAgencyKeyFallback: boolean }> {
  const result = await provisionCustomer(input.accountId);

  if (!result.success || !result.ghl_sub_account_id) {
    throw new Error(result.error ?? "GHL sub-account provisioning failed");
  }

  return {
    locationId: result.ghl_sub_account_id,
    // Compatibility contract from the legacy endpoint response.
    usedAgencyKeyFallback: false,
  };
}
