import "server-only";

import crypto from "node:crypto";

import { GHLClient } from "@/lib/ghl/client";
import { createLocation, updateLocation } from "@/lib/ghl/locations";
import { encryptToken, decryptToken } from "@/lib/ghl/token";
import type {
  GHLBusinessHours,
  GHLCreateLocationPayload,
  GHLWebhookEvent,
} from "@/lib/ghl/types";
import { createWebhook, listWebhooks } from "@/lib/ghl/webhooks";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type AccountRow = Database["public"]["Tables"]["accounts"]["Row"];
type AccountsUpdate = Database["public"]["Tables"]["accounts"]["Update"];
type ProvisioningStatus = AccountRow["ghl_provisioning_status"];
type LegacyProvisioningStatus = AccountRow["provisioning_status"];
type FailedStep =
  | "create_location"
  | "store_credentials"
  | "configure_location"
  | "register_webhooks"
  | "phone_forwarding"
  | "mark_complete";

type ProvisionResult =
  | { success: true }
  | { success: false; failedStep: FailedStep; error: string };

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

const STEP_NAMES: FailedStep[] = [
  "create_location",
  "store_credentials",
  "configure_location",
  "register_webhooks",
  "phone_forwarding",
  "mark_complete",
];

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

const STATE_REGEX = new RegExp(`\\b(${Object.keys(STATE_TIMEZONE).join("|")})\\b`);
const PHONE_SETUP_ALERT_SUMMARY =
  "Phone setup still needs manual completion in HighLevel.";

function inferTimezone(addressState: string | null, serviceArea: string | null): string {
  const stateCode = addressState?.trim().toUpperCase();
  if (stateCode && STATE_TIMEZONE[stateCode]) {
    return STATE_TIMEZONE[stateCode];
  }

  const serviceAreaMatch = serviceArea?.toUpperCase().match(STATE_REGEX);
  if (serviceAreaMatch?.[1] && STATE_TIMEZONE[serviceAreaMatch[1]]) {
    return STATE_TIMEZONE[serviceAreaMatch[1]];
  }

  return "America/New_York";
}

function toLegacyStatus(status: ProvisioningStatus): LegacyProvisioningStatus {
  if (status === "failed") return "error";
  return status;
}

function buildCompletionCompatFields(): Pick<
  AccountsUpdate,
  "onboarding_completed_at" | "onboarding_done_at" | "provisioning_completed_at"
> {
  const now = new Date().toISOString();
  return {
    onboarding_completed_at: now,
    onboarding_done_at: now,
    provisioning_completed_at: now,
  };
}

function getAgencyCompanyId(): string {
  const companyId = process.env.GHL_AGENCY_ID ?? process.env.GHL_AGENCY_COMPANY_ID;
  if (!companyId) {
    throw new Error("GHL_AGENCY_ID or GHL_AGENCY_COMPANY_ID is required");
  }
  return companyId;
}

function getWebhookBaseUrl(): string {
  const baseUrl =
    process.env.VECTOR48_BASE_URL ??
    process.env.VECTOR40_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL;

  if (!baseUrl) {
    throw new Error(
      "VECTOR48_BASE_URL, VECTOR40_BASE_URL, or NEXT_PUBLIC_APP_URL is required",
    );
  }

  return baseUrl.replace(/\/+$/, "");
}

function parseTime(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(":").map((part) => Number(part));
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function mapCustomBusinessHours(
  customHours: Record<string, unknown>,
): GHLBusinessHours[] {
  const dayOrder: Array<GHLBusinessHours["dayOfWeek"]> = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];

  return dayOrder.map((day) => {
    const raw = customHours[day];
    const entry =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const closed = entry.closed === true;
    const open = typeof entry.open === "string" ? entry.open : "08:00";
    const close = typeof entry.close === "string" ? entry.close : "17:00";
    const openParts = parseTime(open);
    const closeParts = parseTime(close);

    return {
      dayOfWeek: day,
      openHour: openParts.hour,
      openMinute: openParts.minute,
      closeHour: closeParts.hour,
      closeMinute: closeParts.minute,
      isOpen: !closed,
    };
  });
}

function mapPresetBusinessHours(preset: string): GHLBusinessHours[] {
  const allDays: Array<GHLBusinessHours["dayOfWeek"]> = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];

  const weekday = new Set(allDays.slice(0, 5));
  const allWeek = preset === "all_week";
  const start = preset === "weekday_7_6" ? { hour: 7, minute: 0 } : { hour: 8, minute: 0 };
  const end = preset === "weekday_7_6" ? { hour: 18, minute: 0 } : { hour: 17, minute: 0 };

  return allDays.map((day) => {
    const isOpen = allWeek || weekday.has(day);
    return {
      dayOfWeek: day,
      openHour: start.hour,
      openMinute: start.minute,
      closeHour: end.hour,
      closeMinute: end.minute,
      isOpen,
    };
  });
}

function mapBusinessHours(raw: AccountRow["business_hours"]): GHLBusinessHours[] {
  const config = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const preset =
    typeof config.preset === "string" ? config.preset : "weekday_8_5";

  if (
    preset === "custom" &&
    config.customHours &&
    typeof config.customHours === "object"
  ) {
    return mapCustomBusinessHours(config.customHours as Record<string, unknown>);
  }

  return mapPresetBusinessHours(preset);
}

function parseFailedStep(error: string | null): FailedStep | undefined {
  if (!error) return undefined;
  const [stepName] = error.split(":");
  return STEP_NAMES.find((candidate) => candidate === stepName);
}

async function updateAccount(accountId: string, data: AccountsUpdate) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("accounts").update(data).eq("id", accountId);
  if (error) {
    throw new Error(`DB update failed: ${error.message}`);
  }
}

async function writeProvisioningState(
  accountId: string,
  status: ProvisioningStatus,
  extra: AccountsUpdate = {},
) {
  await updateAccount(accountId, {
    ghl_provisioning_status: status,
    provisioning_status: toLegacyStatus(status),
    ...extra,
  });
}

async function failProvisioning(
  accountId: string,
  failedStep: FailedStep,
  error: unknown,
): Promise<ProvisionResult> {
  const message = error instanceof Error ? error.message : String(error);
  const safeMessage = `${failedStep}: ${message}`.slice(0, 4000);

  try {
    await writeProvisioningState(accountId, "failed", {
      ghl_provisioning_error: safeMessage,
      provisioning_error: safeMessage,
    });
  } catch (writeError) {
    console.error("[provisionGHL] failed to write failure state", writeError);
  }

  return {
    success: false,
    failedStep,
    error: message,
  };
}

async function fetchAccount(accountId: string): Promise<AccountRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load account: ${error.message}`);
  }

  return data;
}

async function ensurePhoneSetupAlert(account: AccountRow) {
  const supabase = createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("automation_events")
    .select("id, detail")
    .eq("account_id", account.id)
    .eq("event_type", "alert")
    .eq("summary", PHONE_SETUP_ALERT_SUMMARY)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to inspect phone setup alert: ${existingError.message}`);
  }

  const existingDetail =
    existing?.detail && typeof existing.detail === "object"
      ? (existing.detail as Record<string, unknown>)
      : null;

  if (existing && existingDetail?.resolved !== true) {
    return;
  }

  const actionText = account.phone
    ? `Add ${account.phone} as the forwarding destination in LC Phone.`
    : "Purchase and assign an LC Phone number inside HighLevel.";

  const { error: insertError } = await supabase.from("automation_events").insert({
    account_id: account.id,
    event_type: "alert",
    summary: PHONE_SETUP_ALERT_SUMMARY,
    detail: {
      kind: "phone_setup_manual",
      resolved: false,
      action_text: actionText,
    },
  });

  if (insertError) {
    throw new Error(`Failed to create phone setup alert: ${insertError.message}`);
  }
}

async function ensureWebhookSecret(account: AccountRow): Promise<string> {
  if (account.ghl_webhook_secret) {
    return account.ghl_webhook_secret;
  }

  const secret = crypto.randomBytes(24).toString("hex");
  await updateAccount(account.id, { ghl_webhook_secret: secret });
  account.ghl_webhook_secret = secret;
  return secret;
}

function hasRequiredWebhook(events: string[] | null | undefined): boolean {
  const normalized = new Set(events ?? []);
  return WEBHOOK_EVENTS.every((event) => normalized.has(event));
}

async function ensureLocationToken(account: AccountRow): Promise<string> {
  if (account.ghl_token_encrypted) {
    return decryptToken(account.ghl_token_encrypted);
  }

  if (!account.ghl_location_id) {
    throw new Error("Location token requested before location creation");
  }

  const tokenResponse = await GHLClient.exchangeSubAccountToken(
    getAgencyCompanyId(),
    account.ghl_location_id,
  );
  const accessToken = tokenResponse.access_token;
  const encryptedToken = encryptToken(accessToken);

  await updateAccount(account.id, {
    ghl_token_encrypted: encryptedToken,
    provisioning_step: Math.max(account.provisioning_step ?? 0, 2),
  });

  account.ghl_token_encrypted = encryptedToken;
  return accessToken;
}

export async function provisionGHL(accountId: string): Promise<ProvisionResult> {
  let account: AccountRow | null;

  try {
    account = await fetchAccount(accountId);
  } catch (error) {
    return failProvisioning(accountId, "create_location", error);
  }

  if (!account) {
    return {
      success: false,
      failedStep: "create_location",
      error: `Account ${accountId} not found`,
    };
  }

  if (account.ghl_provisioning_status === "complete") {
    return { success: true };
  }

  try {
    await writeProvisioningState(accountId, "in_progress", {
      ghl_provisioning_error: null,
      provisioning_error: null,
    });
  } catch (error) {
    return failProvisioning(accountId, "create_location", error);
  }

  try {
    if (!account.ghl_location_id) {
      const payload: GHLCreateLocationPayload = {
        companyId: getAgencyCompanyId(),
        name: account.business_name,
        phone: account.phone ?? undefined,
        city: account.address_city ?? undefined,
        state: account.address_state ?? undefined,
        postalCode: account.address_zip ?? undefined,
        country: "US",
        timezone: inferTimezone(account.address_state, account.service_area),
      };

      const { location } = await createLocation(payload);
      account.ghl_location_id = location.id;

      await updateAccount(accountId, {
        ghl_location_id: location.id,
        provisioning_step: 1,
      });

      if (location.apiKey) {
        const encrypted = encryptToken(location.apiKey);
        account.ghl_token_encrypted = encrypted;
        await updateAccount(accountId, {
          ghl_token_encrypted: encrypted,
          provisioning_step: 2,
        });
      }
    }
  } catch (error) {
    return failProvisioning(accountId, "create_location", error);
  }

  let locationToken: string;
  try {
    locationToken = await ensureLocationToken(account);
  } catch (error) {
    return failProvisioning(accountId, "store_credentials", error);
  }

  const locationId = account.ghl_location_id;
  if (!locationId) {
    return failProvisioning(
      accountId,
      "store_credentials",
      new Error("Location ID missing after provisioning step 1"),
    );
  }

  const locationOpts = { apiKey: locationToken, locationId };

  try {
    await updateLocation(
      locationId,
      {
        name: account.business_name,
        phone: account.phone ?? undefined,
        city: account.address_city ?? undefined,
        state: account.address_state ?? undefined,
        postalCode: account.address_zip ?? undefined,
        timezone: inferTimezone(account.address_state, account.service_area),
        settings: {
          businessName: account.business_name,
          businessHours: mapBusinessHours(account.business_hours),
        },
      },
      locationOpts,
    );

    await updateAccount(accountId, {
      provisioning_step: Math.max(account.provisioning_step ?? 0, 3),
    });
  } catch (error) {
    return failProvisioning(accountId, "configure_location", error);
  }

  try {
    const webhookSecret = await ensureWebhookSecret(account);
    const webhookUrl = `${getWebhookBaseUrl()}/api/webhooks/ghl`;
    const existing = await listWebhooks(locationId, locationOpts);
    const alreadyRegistered = (existing.webhooks ?? []).some(
      (webhook) =>
        webhook.url === webhookUrl && hasRequiredWebhook(webhook.events),
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
      provisioning_step: Math.max(account.provisioning_step ?? 0, 4),
    });
  } catch (error) {
    return failProvisioning(accountId, "register_webhooks", error);
  }

  try {
    await ensurePhoneSetupAlert(account);
    await updateAccount(accountId, {
      provisioning_step: Math.max(account.provisioning_step ?? 0, 5),
    });
  } catch (error) {
    return failProvisioning(accountId, "phone_forwarding", error);
  }

  try {
    await writeProvisioningState(accountId, "complete", {
      ghl_provisioning_error: null,
      provisioning_error: null,
      provisioning_step: 6,
      ...buildCompletionCompatFields(),
    });
    return { success: true };
  } catch (error) {
    return failProvisioning(accountId, "mark_complete", error);
  }
}

export function failedStepFromError(error: string | null): FailedStep | undefined {
  return parseFailedStep(error);
}
