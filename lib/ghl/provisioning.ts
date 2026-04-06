// ---------------------------------------------------------------------------
// GHL Sub-Account + Voice AI Provisioning Orchestrator
// Server-only: creates a GHL sub-account, exchanges tokens, configures
// Voice AI, registers webhooks, and stores all credentials in Supabase.
//
// This is DISTINCT from n8n provisioning (lib/n8n/provision.ts) which handles
// recipe workflow deployment. This module sets up the GHL infrastructure that
// n8n workflows later interact with.
// ---------------------------------------------------------------------------
import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { encryptToken } from "./token";
import { GHLClient } from "./client";
import { GHL_DEFAULT_VOICES } from "./voiceTypes";
import type { GHLCreateVoiceAgentPayload } from "./voiceTypes";
import type { GHLWebhookEvent } from "./types";
import { createWebhook, listWebhooks } from "./webhooks";


// ── Types ──────────────────────────────────────────────────────────────────

export interface ProvisionResult {
  success: boolean;
  error?: string;
  ghl_sub_account_id?: string;
  ghl_voice_agent_id?: string;
}

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

// ── Helpers ────────────────────────────────────────────────────────────────

function sanitizeError(err: unknown): string {
  if (err instanceof Error) {
    return err.message.slice(0, 4000);
  }
  return "Provisioning failed";
}

function hasRequiredWebhook(events: string[] | null | undefined): boolean {
  const normalized = new Set(events ?? []);
  return WEBHOOK_EVENTS.every((event) => normalized.has(event));
}

function log(step: string, accountId: string, detail?: string) {
  console.log(
    JSON.stringify({
      level: "info",
      service: "ghl-provisioning",
      step,
      accountId,
      detail: detail ?? undefined,
      ts: new Date().toISOString(),
    }),
  );
}

function logError(step: string, accountId: string, error: string) {
  console.error(
    JSON.stringify({
      level: "error",
      service: "ghl-provisioning",
      step,
      accountId,
      error,
      ts: new Date().toISOString(),
    }),
  );
}

// ── Main Orchestrator ──────────────────────────────────────────────────────

/**
 * Provision a customer's GHL infrastructure after onboarding completion.
 *
 * Steps:
 * 1. Read account + user data from Supabase
 * 2. Create GHL sub-account (location)
 * 3. Exchange agency token for sub-account token
 * 4. Create Voice AI agent on the sub-account
 * 5. Create Voice AI custom action (webhook to n8n)
 * 6. Register GHL webhooks for recipe event types
 * 7. Update provisioning status to complete
 *
 * This function never throws. Callers should check the returned status.
 */
export async function provisionCustomer(
  accountId: string,
): Promise<ProvisionResult> {
  const supabase = getSupabaseAdmin();

  try {
    // ── Step 1: Read account data ──────────────────────────────────────

    log("step_1_read_account", accountId);

    const { data: account, error: accErr } = await supabase
      .from("accounts")
      .select("*")
      .eq("id", accountId)
      .single();

    if (accErr || !account) {
      const msg = `Account not found: ${accErr?.message ?? "no data"}`;
      await markFailed(supabase, accountId, msg);
      return { success: false, error: msg };
    }

    // Fetch user email from auth.users
    const { data: userData } = await supabase.auth
      .admin.getUserById(account.owner_user_id);
    const userEmail = userData?.user?.email ?? "";

    // ── Step 2: Create GHL sub-account ─────────────────────────────────

    log("step_2_create_sub_account", accountId);

    const companyId = process.env.GHL_AGENCY_COMPANY_ID;
    if (!companyId) {
      const msg = "GHL_AGENCY_COMPANY_ID is not configured";
      await markFailed(supabase, accountId, msg);
      return { success: false, error: msg };
    }

    const agencyClient = GHLClient.forAgency();

    // If sub-account was already created in a prior attempt, reuse it
    let locationId: string;
    let locationApiKeyFromCreate: string | null = null;
    if (account.ghl_location_id) {
      locationId = account.ghl_location_id;
      log("step_2_reuse_existing", accountId, `locationId=${locationId}`);
    } else {
      const location = await agencyClient.locations.create({
        companyId,
        name: account.business_name,
        phone: account.phone ?? undefined,
        city: account.address_city ?? undefined,
        country: "US",
        timezone: "America/Phoenix",
        email: userEmail || undefined,
      });

      locationId = location.id;
      locationApiKeyFromCreate = location.apiKey ?? null;

      // Store sub-account ID immediately so we can recover on retry
      await supabase
        .from("accounts")
        .update({ ghl_location_id: locationId })
        .eq("id", accountId);
    }

    log("step_2_complete", accountId, `locationId=${locationId}`);

    // ── Step 3: Resolve + store location token ─────────────────────────

    log("step_3_token_exchange", accountId);

    let subAccountToken = locationApiKeyFromCreate;
    let tokenSource: "location_api_key" | "oauth_exchange" | "agency_fallback" =
      locationApiKeyFromCreate ? "location_api_key" : "agency_fallback";

    if (!subAccountToken) {
      try {
        const tokenExchange = await GHLClient.exchangeSubAccountToken(companyId, locationId);
        subAccountToken = tokenExchange.access_token;
        tokenSource = "oauth_exchange";
      } catch (tokenExchangeErr) {
        // Private integrations can return 401 for this OAuth-only endpoint.
        const agencyApiKey = process.env.GHL_AGENCY_API_KEY;
        if (!agencyApiKey) {
          const msg = `Failed to resolve sub-account token: ${sanitizeError(tokenExchangeErr)}`;
          await markFailed(supabase, accountId, msg);
          return { success: false, error: msg };
        }

        subAccountToken = agencyApiKey;
        tokenSource = "agency_fallback";
        logError("step_3_token_exchange_failed_fallback", accountId, sanitizeError(tokenExchangeErr));
      }
    }

    if (!subAccountToken) {
      const msg = "Failed to resolve sub-account token";
      await markFailed(supabase, accountId, msg);
      return { success: false, error: msg };
    }

    // Store encrypted token on the account (used by getGHLClient)
    const encryptedToken = encryptToken(subAccountToken);
    await supabase
      .from("accounts")
      .update({ ghl_token_encrypted: encryptedToken })
      .eq("id", accountId);

    // Also store in integrations table for explicit credential tracking
    await supabase
      .from("integrations")
      .upsert(
        {
          account_id: accountId,
          provider: "ghl" as const,
          status: "connected" as const,
          credentials_encrypted: {
            access_token_encrypted: encryptedToken,
            location_id: locationId,
            token_type: tokenSource,
            expires_in: null,
            scope: tokenSource === "agency_fallback" ? "agency" : "location",
          },
        },
        { onConflict: "account_id,provider" },
      );

    log("step_3_complete", accountId, `source=${tokenSource}`);

    // ── Step 4: Create Voice AI agent (best-effort) ────────────────────
    // Non-fatal: Voice AI may not be available for all plans or newly
    // created sub-accounts. Phone number assignment is always manual.

    log("step_4_create_voice_agent", accountId);

    const locationClient = GHLClient.forLocation(locationId, subAccountToken);
    let voiceAgentId: string | null = null;

    try {
      const voiceGender: "male" | "female" =
        account.voice_gender === "male" ? "male" : "female";

      const greeting =
        account.greeting_text ||
        `Hi, thanks for calling ${account.business_name}. How can I help you today?`;

      const agentPayload: GHLCreateVoiceAgentPayload = {
        locationId,
        name: `${account.business_name} AI Assistant`,
        businessName: account.business_name,
        greeting,
        prompt: buildVoicePrompt(account.business_name, account.vertical),
        voiceId: GHL_DEFAULT_VOICES[voiceGender],
        gender: voiceGender,
        language: "en-US",
        timezone: "America/Phoenix",
        goals: [
          { field: "caller_name", label: "Caller Name", required: true },
          { field: "phone_number", label: "Phone Number", required: true },
          { field: "reason_for_call", label: "Reason for Call", required: true },
        ],
      };

      const agentRes = await locationClient.voiceAgent.create(agentPayload);
      voiceAgentId = agentRes.agent.id;

      await supabase
        .from("accounts")
        .update({ ghl_voice_agent_id: voiceAgentId })
        .eq("id", accountId);

      log("step_4_complete", accountId, `agentId=${voiceAgentId}`);

      // [MANUAL STEP] Assign phone number to Voice AI agent.
      // The GHL API does not support programmatic phone number assignment
      // to Voice AI agents. Use the GHL admin panel to assign a number.
      console.warn(
        `[MANUAL STEP] Assign phone number to Voice AI agent for account ${accountId} (agent ${voiceAgentId})`,
      );
    } catch (voiceErr) {
      logError("step_4_skipped", accountId, sanitizeError(voiceErr));
      console.warn(
        `[ghl-provisioning] Voice AI agent creation skipped for ${accountId}: ${sanitizeError(voiceErr)}`,
      );
    }

    // ── Step 5: Create Voice AI custom action (webhook to n8n) ─────────
    // Non-fatal: only attempted if step 4 succeeded.

    log("step_5_create_webhook_action", accountId);

    if (voiceAgentId) {
      const n8nBase = (process.env.N8N_WEBHOOK_BASE_URL ?? process.env.N8N_BASE_URL ?? "").replace(/\/+$/, "");

      if (n8nBase) {
        try {
          await locationClient.voiceAgent.createAction(voiceAgentId, {
            type: "webhook",
            url: `${n8nBase}/recipe-ai-phone-answering/${accountId}`,
            method: "POST",
            description: "Post-call data to n8n for processing (summary, SMS notification)",
          });
          log("step_5_complete", accountId);
        } catch (actionErr) {
          logError("step_5_skipped", accountId, sanitizeError(actionErr));
        }
      } else {
        console.warn(
          `[ghl-provisioning] N8N_WEBHOOK_BASE_URL not set — skipping Voice AI action creation for ${accountId}`,
        );
      }
    } else {
      log("step_5_skipped_no_agent", accountId);
    }

    // ── Step 6: Register location webhook idempotently ─────────────────
    log("step_6_register_webhooks", accountId);
    try {
      const webhookUrl = `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "")}/api/webhooks/ghl`;
      if (!webhookUrl.startsWith("http")) {
        throw new Error("NEXT_PUBLIC_APP_URL is not configured");
      }

      const existing = await listWebhooks(locationId, {
        locationId,
        apiKey: subAccountToken,
      });
      const alreadyRegistered = (existing.webhooks ?? []).some(
        (webhook) => webhook.url === webhookUrl && hasRequiredWebhook(webhook.events),
      );

      if (!alreadyRegistered) {
        await createWebhook(
          {
            locationId,
            url: webhookUrl,
            events: WEBHOOK_EVENTS,
            secret: account.ghl_webhook_secret ?? undefined,
          },
          { locationId, apiKey: subAccountToken },
        );
      }
      log("step_6_complete", accountId);
    } catch (webhookErr) {
      const msg = `Webhook registration failed: ${sanitizeError(webhookErr)}`;
      await markFailed(supabase, accountId, msg);
      return { success: false, error: msg };
    }

    // ── Step 7: Mark provisioning complete ─────────────────────────────

    log("step_7_complete", accountId);

    await supabase
      .from("accounts")
      .update({
        ghl_provisioning_status: "complete",
        ghl_provisioning_error: null,
        provisioning_completed_at: new Date().toISOString(),
      })
      .eq("id", accountId);

    return {
      success: true,
      ghl_sub_account_id: locationId,
      ghl_voice_agent_id: voiceAgentId ?? undefined,
    };
  } catch (err) {
    const msg = sanitizeError(err);
    logError("unhandled", accountId, msg);
    await markFailed(supabase, accountId, msg);
    return { success: false, error: msg };
  }
}

// ── Public adapters ────────────────────────────────────────────────────────

/**
 * On-demand provisioning entry point used by the REST API endpoint
 * (`/api/onboarding/provision-ghl`). Unlike `provisionCustomer`, this
 * throws on failure so callers can catch and surface the error as an HTTP
 * response without inspecting a success flag.
 *
 * `ownerEmail` is accepted for forward-compat but is not needed: the
 * provisioning orchestrator reads the owner email from Supabase auth data
 * directly via `account.owner_user_id`.
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
    // Private integrations always use the agency key as the location token —
    // there is no per-location OAuth exchange for this integration type.
    usedAgencyKeyFallback: true,
  };
}

// ── Internal Helpers ───────────────────────────────────────────────────────

async function markFailed(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  accountId: string,
  error: string,
): Promise<void> {
  await supabase
    .from("accounts")
    .update({
      ghl_provisioning_status: "failed",
      ghl_provisioning_error: error.slice(0, 4000),
    })
    .eq("id", accountId);
}

function buildVoicePrompt(businessName: string, vertical: string): string {
  const verticalContext: Record<string, string> = {
    hvac: "heating, ventilation, and air conditioning",
    plumbing: "plumbing",
    electrical: "electrical",
    roofing: "roofing",
    landscaping: "landscaping",
  };

  const trade = verticalContext[vertical] ?? "home services";

  return [
    `You are the AI phone assistant for ${businessName}, a ${trade} company.`,
    "Your job is to answer incoming calls professionally, collect the caller's information, and understand their needs.",
    "",
    "Always collect: 1) Caller's full name, 2) Phone number (confirm it), 3) Reason for calling.",
    "If the caller describes an emergency, let them know a team member will call back urgently.",
    "Be friendly, professional, and concise. Do not make promises about pricing or scheduling.",
    `End the call by thanking them for calling ${businessName}.`,
  ].join("\n");
}
