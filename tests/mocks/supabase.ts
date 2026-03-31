// ---------------------------------------------------------------------------
// Mock Supabase admin client for provisioning tests
// ---------------------------------------------------------------------------

import type { Database } from "@/lib/supabase/types";

type AccountRow = Database["public"]["Tables"]["accounts"]["Row"];

// ── Update log for assertions ─────────────────────────────────────────────

export interface UpdateLogEntry {
  table: string;
  data: Record<string, unknown>;
  eqField: string;
  eqValue: string;
}

export const updateLog: UpdateLogEntry[] = [];

export function resetUpdateLog() {
  updateLog.length = 0;
}

// ── Default mock account ──────────────────────────────────────────────────

let mockAccount: AccountRow;

export function setMockAccount(account: AccountRow) {
  mockAccount = account;
}

export function createMockAccount(
  overrides: Partial<AccountRow> = {},
): AccountRow {
  const now = new Date().toISOString();
  return {
    id: "acc_test_001",
    owner_user_id: "user_test_001",
    business_name: "Ace Plumbing Co",
    phone: "+15551234567",
    email: null,
    address_city: "Dallas",
    address_state: "TX",
    address_zip: null,
    vertical: "plumbing",
    business_hours: {},
    ghl_location_id: null,
    ghl_webhook_secret: null,
    ghl_token_encrypted: null,
    onboarding_done_at: null,
    provisioning_status: "pending",
    provisioning_error: null,
    provisioning_completed_at: null,
    provisioning_step: 0,
    ghl_provisioning_status: "pending",
    ghl_provisioning_error: null,
    ghl_health_status: "unknown",
    ghl_last_health_check: null,
    ghl_last_synced_at: null,
    ghl_voice_agent_id: null,
    elevenlabs_voice_id: null,
    voice_gender: null,
    greeting_text: null,
    greeting_name: null,
    greeting_audio_url: null,
    notification_contact_name: null,
    notification_contact_phone: null,
    notification_email: null,
    notifications_enabled: false,
    quiet_hours_start: null,
    quiet_hours_end: null,
    notification_preferences: {},
    timezone: "America/Chicago",
    onboarding_step: 8,
    onboarding_completed_at: null,
    activate_recipe_1: false,
    plan_slug: "trial",
    trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: "trialing",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// ── Chainable query builder mock ──────────────────────────────────────────

function createChainableSelect() {
  return {
    eq(_field: string, _value: string) {
      return {
        single() {
          return Promise.resolve({ data: mockAccount, error: null });
        },
      };
    },
  };
}

function createChainableUpdate(data: Record<string, unknown>) {
  return {
    eq(field: string, value: string) {
      updateLog.push({ table: "accounts", data, eqField: field, eqValue: value });
      Object.assign(mockAccount, data);
      return Promise.resolve({ error: null });
    },
  };
}

export const mockSupabaseClient = {
  from(table: string) {
    if (table !== "accounts") {
      throw new Error(`[mock] Unexpected table: ${table}`);
    }
    return {
      select(_columns: string) {
        return createChainableSelect();
      },
      update(data: Record<string, unknown>) {
        return createChainableUpdate(data);
      },
    };
  },
};
