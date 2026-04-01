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
export const insertLog: Array<{ table: string; data: Record<string, unknown> }> = [];

export function resetUpdateLog() {
  updateLog.length = 0;
  insertLog.length = 0;
}

// ── Default mock account ──────────────────────────────────────────────────

let mockAccount: AccountRow;
let mockAutomationEvents: Array<Record<string, unknown>> = [];

export function setMockAccount(account: AccountRow) {
  mockAccount = account;
  mockAutomationEvents = [];
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
    ghl_webhook_secret: null,
    ghl_token_encrypted: null,
    ghl_voice_agent_id: null,
    trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    stripe_customer_id: null,
    stripe_subscription_id: null,
    plan_slug: "trial",
    provisioning_status: "pending",
    provisioning_error: null,
    provisioning_completed_at: null,
    ghl_provisioning_status: "pending",
    ghl_provisioning_error: null,
    provisioning_step: 0,
    onboarding_completed_at: null,
    onboarding_done_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    service_area: "Dallas, TX",
    business_hours: {},
    voice_gender: null,
    voice_greeting: null,
    notification_sms: false,
    notification_email: false,
    notification_contact: null,
    notification_preferences: {},
    onboarding_step: 8,
    ...overrides,
  } as AccountRow;
}

// ── Chainable query builder mock ──────────────────────────────────────────

function createAutomationEventsSelect() {
  const filters: Array<{ field: string; value: unknown }> = [];

  const api = {
    eq(field: string, value: unknown) {
      const existingFilter = filters.find((filter) => filter.field === field);
      if (existingFilter) {
        existingFilter.value = value;
      } else {
        filters.push({ field, value });
      }
      return api;
    },
    order() {
      return api;
    },
    limit() {
      return api;
    },
    maybeSingle() {
      const event =
        mockAutomationEvents.find((candidate) => {
          return filters.every(({ field, value }) => candidate[field] === value);
        }) ?? null;
      return Promise.resolve({ data: event, error: null });
    },
  };

  return api;
}

function createChainableSelect(table: string) {
  const api = {
    eq(_field: string, _value: string) {
      return api;
    },
    single() {
      return Promise.resolve({ data: mockAccount, error: null });
    },
    maybeSingle() {
      return Promise.resolve({ data: mockAccount, error: null });
    },
  };

  if (table === "automation_events") {
    return createAutomationEventsSelect();
  }

  return api;
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

function createChainableInsert(table: string) {
  return {
    values: null,
    insert(data: Record<string, unknown>) {
      insertLog.push({ table, data });
      mockAutomationEvents.unshift({
        id: "alert_mock_001",
        created_at: new Date().toISOString(),
        ...data,
      });
      return Promise.resolve({ error: null });
    },
  };
}

export const mockSupabaseClient = {
  from(table: string) {
    if (!["accounts", "automation_events"].includes(table)) {
      throw new Error(`[mock] Unexpected table: ${table}`);
    }
    return {
      select(_columns: string) {
        return createChainableSelect(table);
      },
      update(data: Record<string, unknown>) {
        if (table !== "accounts") {
          throw new Error(`[mock] Unexpected update table: ${table}`);
        }
        return createChainableUpdate(data);
      },
      insert(data: Record<string, unknown>) {
        if (table !== "automation_events") {
          throw new Error(`[mock] Unexpected insert table: ${table}`);
        }
        insertLog.push({ table, data });
        mockAutomationEvents.unshift({
          id: "alert_mock_001",
          created_at: new Date().toISOString(),
          ...data,
        });
        return Promise.resolve({ error: null });
      },
    };
  },
};
