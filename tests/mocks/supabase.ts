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
  return {
    id: "acc_test_001",
    owner_user_id: "user_test_001",
    business_name: "Ace Plumbing Co",
    phone: "+15551234567",
    vertical: "plumbing",
    ghl_location_id: null,
    ghl_sub_account_id: null,
    ghl_token_encrypted: null,
    onboarding_done_at: null,
    trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    stripe_customer_id: null,
    stripe_subscription_id: null,
    plan_slug: "trial",
    provisioning_status: "pending",
    provisioning_error: null,
    provisioning_step: 0,
    created_at: new Date().toISOString(),
    service_area: "Dallas, TX",
    business_hours: null,
    voice_gender: null,
    voice_greeting: null,
    notification_sms: false,
    notification_email: false,
    notification_contact: null,
    onboarding_step: 8,
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
      // Apply updates to mockAccount so subsequent reads reflect changes
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
