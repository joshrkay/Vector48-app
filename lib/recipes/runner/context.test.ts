import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRecipeContext, type SupabaseContextClient, type TenantAgent } from "./context.ts";

function makeSupabaseAccountRow(accountId: string): SupabaseContextClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: accountId,
              business_name: "Test Plumbing",
              vertical: "plumbing",
              plan_slug: "pro",
              greeting_name: "Janet",
              notification_contact_phone: "+15551234567",
            },
            error: null,
          }),
        }),
      }),
    }),
  };
}

const activeAgent: TenantAgent = {
  id: "agent-1",
  account_id: "acct-1",
  recipe_slug: "ai-phone-answering",
  display_name: "AI Phone",
  system_prompt: "prompt",
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  temperature: 0,
  voice_id: null,
  tool_config: {},
  monthly_spend_cap_micros: null,
  rate_limit_per_hour: null,
  status: "active",
};

describe("buildRecipeContext", () => {
  it("returns a structured skip result when GHL credentials are missing", async () => {
    const result = await buildRecipeContext({
      accountId: "acct-1",
      agent: activeAgent,
      deps: {
        supabase: makeSupabaseAccountRow("acct-1"),
        getGhlCredentials: async () => {
          throw new Error("No GHL credentials for account acct-1");
        },
      },
    });

    assert.equal(result.ok, false);
    if (result.ok) {
      assert.fail("expected skip result");
    }
    assert.equal(result.outcome, "skipped_no_ghl_creds");
    assert.equal(result.reason, "missing_ghl_credentials");
    assert.equal(result.accountId, "acct-1");
  });
});
