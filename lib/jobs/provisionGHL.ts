// ---------------------------------------------------------------------------
// GHL Provisioning Job
// Creates a GHL sub-account (location) for a customer after onboarding.
// Idempotent — safe to retry after partial failure.
// ---------------------------------------------------------------------------

import { createAdminClient } from "@/lib/supabase/admin";
import { createLocation, updateLocation } from "@/lib/ghl/locations";
import { createWebhook, listWebhooks } from "@/lib/ghl/webhooks";
import { encryptToken, decryptToken } from "@/lib/ghl/token";
import type {
  GHLCreateLocationPayload,
  GHLWebhookEvent,
} from "@/lib/ghl/types";

// ── Constants ─────────────────────────────────────────────────────────────

const WEBHOOK_EVENTS: GHLWebhookEvent[] = [
  "ContactCreate",
  "ContactUpdate",
  "ConversationUnreadUpdate",
  "OpportunityCreate",
  "OpportunityStageUpdate",
  "AppointmentCreate",
  "AppointmentStatusUpdate",
  "InboundMessage",
  "CallCompleted",
];

const STEP_NAMES: Record<number, string> = {
  1: "create_location",
  2: "store_credentials",
  3: "configure_location",
  4: "register_webhooks",
  5: "phone_forwarding",
  6: "mark_complete",
};

// ── Timezone mapping (US state abbreviations) ─────────────────────────────

const STATE_TIMEZONE: Record<string, string> = {
  HI: "Pacific/Honolulu",
  AK: "America/Anchorage",
  WA: "America/Los_Angeles",
  OR: "America/Los_Angeles",
  CA: "America/Los_Angeles",
  NV: "America/Los_Angeles",
  ID: "America/Boise",
  MT: "America/Denver",
  WY: "America/Denver",
  UT: "America/Denver",
  CO: "America/Denver",
  AZ: "America/Phoenix",
  NM: "America/Denver",
  ND: "America/Chicago",
  SD: "America/Chicago",
  NE: "America/Chicago",
  KS: "America/Chicago",
  OK: "America/Chicago",
  TX: "America/Chicago",
  MN: "America/Chicago",
  IA: "America/Chicago",
  MO: "America/Chicago",
  AR: "America/Chicago",
  LA: "America/Chicago",
  WI: "America/Chicago",
  IL: "America/Chicago",
  MS: "America/Chicago",
  AL: "America/Chicago",
  TN: "America/Chicago",
  KY: "America/New_York",
  IN: "America/Indiana/Indianapolis",
  MI: "America/Detroit",
  OH: "America/New_York",
  WV: "America/New_York",
  VA: "America/New_York",
  NC: "America/New_York",
  SC: "America/New_York",
  GA: "America/New_York",
  FL: "America/New_York",
  PA: "America/New_York",
  NY: "America/New_York",
  NJ: "America/New_York",
  DE: "America/New_York",
  MD: "America/New_York",
  DC: "America/New_York",
  CT: "America/New_York",
  RI: "America/New_York",
  MA: "America/New_York",
  VT: "America/New_York",
  NH: "America/New_York",
  ME: "America/New_York",
};

const STATE_REGEX = new RegExp(
  `\\b(${Object.keys(STATE_TIMEZONE).join("|")})\\b`,
);

function inferTimezone(serviceArea: string | null): string {
  if (!serviceArea) return "America/New_York";
  const match = serviceArea.toUpperCase().match(STATE_REGEX);
  if (match) return STATE_TIMEZONE[match[1]] ?? "America/New_York";
  return "America/New_York";
}

// ── Helper: update provisioning state ─────────────────────────────────────

type ProvisioningUpdate = {
  provisioning_step?: number;
  provisioning_status?: "pending" | "complete" | "error";
  provisioning_error?: string | null;
  ghl_location_id?: string;
  ghl_sub_account_id?: string;
  ghl_token_encrypted?: string;
  onboarding_done_at?: string;
};

async function updateAccount(accountId: string, data: ProvisioningUpdate) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("accounts")
    .update(data)
    .eq("id", accountId);

  if (error) {
    console.error(`[provisionGHL] Failed to update account ${accountId}:`, error.message);
    throw new Error(`DB update failed: ${error.message}`);
  }
}

async function failStep(accountId: string, step: number, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const stepName = STEP_NAMES[step] ?? `step_${step}`;
  console.error(`[provisionGHL] Step ${step} (${stepName}) failed for ${accountId}:`, message);

  try {
    await updateAccount(accountId, {
      provisioning_status: "error",
      provisioning_error: `${stepName}: ${message}`,
    });
  } catch {
    console.error(`[provisionGHL] Could not write failure state for ${accountId}`);
  }
}

// ── Main provisioning function ────────────────────────────────────────────

export async function provisionGHL(accountId: string): Promise<void> {
  const supabase = createAdminClient();

  // Fetch current account state
  const { data: account, error: fetchError } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .single();

  if (fetchError || !account) {
    console.error(`[provisionGHL] Account ${accountId} not found:`, fetchError?.message);
    return;
  }

  // Already complete — nothing to do
  if (account.provisioning_status === "complete") {
    console.log(`[provisionGHL] Account ${accountId} already provisioned.`);
    return;
  }

  const currentStep = account.provisioning_step ?? 0;

  // ── Step 1: Create GHL location ─────────────────────────────────────
  // Auth: agency-level API key (default from env)
  // Idempotency: skip if ghl_location_id is already set

  if (!account.ghl_location_id) {
    try {
      const companyId = process.env.GHL_AGENCY_ID;
      if (!companyId) {
        throw new Error("GHL_AGENCY_ID env var is required for location creation.");
      }

      const payload: GHLCreateLocationPayload = {
        companyId,
        name: account.business_name,
        phone: account.phone ?? undefined,
        timezone: inferTimezone(account.service_area),
      };

      // Agency-level auth — no locationId override
      const result = await createLocation(payload);
      const location = result.location;

      // Step 1 done — persist locationId immediately so step 2 can proceed
      account.ghl_location_id = location.id;
      account.ghl_sub_account_id = location.id;

      // Step 2: Store credentials (combined with step 1 for atomicity)
      const encryptedToken = encryptToken(location.apiKey);

      await updateAccount(accountId, {
        ghl_location_id: location.id,
        ghl_sub_account_id: location.id,
        ghl_token_encrypted: encryptedToken,
        provisioning_step: 2,
        provisioning_error: null,
      });

      account.ghl_token_encrypted = encryptedToken;
    } catch (err) {
      await failStep(accountId, 1, err);
      return;
    }
  } else if (!account.ghl_token_encrypted) {
    // Location exists but token wasn't stored (partial step 1 failure).
    // We can't recover the token without re-creating the location,
    // so we fail with a clear message.
    await failStep(accountId, 2, new Error(
      "Location exists but API token was not stored. Manual intervention required.",
    ));
    return;
  }

  // From here on, use the location's own API token
  const locationId = account.ghl_location_id!;
  const locationToken = decryptToken(account.ghl_token_encrypted!);
  const locationOpts = { apiKey: locationToken, locationId };

  // ── Step 3: Configure location settings ─────────────────────────────
  // Auth: location token
  // Idempotency: skip if provisioning_step >= 3

  if (currentStep < 3) {
    try {
      await updateLocation(locationId, {
        name: account.business_name,
      }, locationOpts);

      await updateAccount(accountId, {
        provisioning_step: 3,
        provisioning_error: null,
      });
    } catch (err) {
      await failStep(accountId, 3, err);
      return;
    }
  }

  // ── Step 4: Register webhooks ───────────────────────────────────────
  // Auth: location token
  // Idempotency: check if our webhook URL is already registered

  if (currentStep < 4) {
    try {
      const webhookBaseUrl = process.env.VECTOR40_BASE_URL;
      if (!webhookBaseUrl) {
        throw new Error("VECTOR40_BASE_URL env var is required for webhook registration.");
      }

      const webhookUrl = `${webhookBaseUrl}/api/webhooks/ghl`;
      const webhookSecret = process.env.GHL_WEBHOOK_SECRET;
      if (!webhookSecret) {
        throw new Error("GHL_WEBHOOK_SECRET env var is required for webhook verification.");
      }

      // Check if webhook already registered (idempotency)
      const existing = await listWebhooks(locationId, locationOpts);
      const alreadyRegistered = existing.webhooks?.some(
        (w) => w.url === webhookUrl,
      );

      if (!alreadyRegistered) {
        await createWebhook(
          {
            locationId,
            url: webhookUrl,
            events: WEBHOOK_EVENTS,
            secret: webhookSecret,
          },
          locationOpts,
        );
      }

      await updateAccount(accountId, {
        provisioning_step: 4,
        provisioning_error: null,
      });
    } catch (err) {
      await failStep(accountId, 4, err);
      return;
    }
  }

  // ── Step 5: Phone number forwarding (Twilio) ────────────────────────
  // Auth: location token (would also need Twilio credentials)
  // Stub for v1 — Twilio integration not yet implemented

  if (currentStep < 5) {
    try {
      // TODO: Implement Twilio phone forwarding
      // If customer brought their own number, set up forwarding to GHL sub-account.
      // If not, provision a new Twilio number and map it.
      console.warn(
        `[provisionGHL] Step 5 (phone_forwarding) is a stub. ` +
        `Skipping for account ${accountId}. Implement Twilio integration in v2.`,
      );

      await updateAccount(accountId, {
        provisioning_step: 5,
        provisioning_error: null,
      });
    } catch (err) {
      await failStep(accountId, 5, err);
      return;
    }
  }

  // ── Step 6: Mark provisioning complete ──────────────────────────────

  if (currentStep < 6) {
    try {
      await updateAccount(accountId, {
        provisioning_status: "complete",
        provisioning_step: 6,
        provisioning_error: null,
        onboarding_done_at: new Date().toISOString(),
      });

      console.log(`[provisionGHL] Account ${accountId} provisioned successfully.`);
    } catch (err) {
      await failStep(accountId, 6, err);
    }
  }
}
