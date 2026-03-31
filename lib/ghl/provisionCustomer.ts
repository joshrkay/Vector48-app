// ---------------------------------------------------------------------------
// GoHighLevel — Create sub-account (location) and attach agency PIT for API.
// Server-only. Used by provisioning retry and future onboarding hooks.
// ---------------------------------------------------------------------------
import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { GHLClient } from "./client";
import { encryptGhlToken } from "./token";
import { inferTimezone } from "./timezone";

function sanitizeErrorMessage(message: string): string {
  const trimmed = message.trim().slice(0, 500);
  return trimmed.length > 0 ? trimmed : "Provisioning failed";
}

/**
 * Idempotent: if location + encrypted token already exist, sets status complete.
 * Otherwise creates a GHL location under GHL_AGENCY_ID and stores the agency
 * private integration token encrypted (same token works with locationId on requests).
 */
export async function provisionCustomer(accountId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: account, error: fetchErr } = await supabase
    .from("accounts")
    .select(
      "id, business_name, phone, email, address_city, address_state, address_zip, ghl_location_id, ghl_token_encrypted",
    )
    .eq("id", accountId)
    .single();

  if (fetchErr || !account) {
    throw new Error("Account not found");
  }

  if (account.ghl_location_id && account.ghl_token_encrypted) {
    await supabase
      .from("accounts")
      .update({
        ghl_provisioning_status: "complete",
        ghl_provisioning_error: null,
      })
      .eq("id", accountId);
    return;
  }

  const companyId = process.env.GHL_AGENCY_ID;
  if (!companyId) {
    throw new Error("GHL_AGENCY_ID is not configured");
  }

  const agencyKey = process.env.GHL_AGENCY_API_KEY;
  if (!agencyKey) {
    throw new Error("GHL_AGENCY_API_KEY is not configured");
  }

  await supabase
    .from("accounts")
    .update({
      ghl_provisioning_status: "in_progress",
      ghl_provisioning_error: null,
    })
    .eq("id", accountId);

  try {
    let locationId = account.ghl_location_id;

    if (!locationId) {
      const agency = GHLClient.forAgency();
      const parts: string[] = [];
      if (account.address_city) parts.push(account.address_city);
      if (account.address_state) parts.push(account.address_state);
      if (account.address_zip) parts.push(account.address_zip);
      const addressLine = parts.length > 0 ? parts.join(", ") : undefined;

      const res = await agency.locations.create({
        companyId,
        name: account.business_name?.trim() || "New location",
        email: account.email ?? undefined,
        phone: account.phone ?? undefined,
        city: account.address_city ?? undefined,
        state: account.address_state ?? undefined,
        postalCode: account.address_zip ?? undefined,
        address: addressLine,
        country: "US",
        timezone: inferTimezone(account.address_state),
      });

      locationId = res.location?.id;
      if (!locationId) {
        throw new Error("GoHighLevel did not return a location id");
      }
    }

    const encrypted = encryptGhlToken(agencyKey);

    const { error: updateErr } = await supabase
      .from("accounts")
      .update({
        ghl_location_id: locationId,
        ghl_token_encrypted: encrypted,
        ghl_provisioning_status: "complete",
        ghl_provisioning_error: null,
      })
      .eq("id", accountId);

    if (updateErr) {
      throw new Error(updateErr.message);
    }
  } catch (err) {
    const message = sanitizeErrorMessage(
      err instanceof Error ? err.message : "Provisioning failed",
    );
    await supabase
      .from("accounts")
      .update({
        ghl_provisioning_status: "failed",
        ghl_provisioning_error: message,
      })
      .eq("id", accountId);
    throw err;
  }
}
