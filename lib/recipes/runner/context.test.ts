// BUG-2 guard: buildRecipeContext surfaces the typed
// RecipeMissingGhlCredsError so runRecipe can turn it into a graceful
// `skipped_no_ghl_creds` outcome instead of a 500.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  RecipeMissingGhlCredsError,
  buildRecipeContext,
  type SupabaseContextClient,
  type TenantAgent,
} from "./context.ts";

const agent: TenantAgent = {
  id: "agent-1",
  account_id: "acct-1",
  recipe_slug: "review-request",
  display_name: "Review Request",
  system_prompt: "You are helpful.",
  model: "claude-haiku-4-5",
  max_tokens: 200,
  temperature: 0.5,
  voice_id: null,
  tool_config: {},
  monthly_spend_cap_micros: 3_000_000,
  rate_limit_per_hour: 60,
  status: "active",
};

function fakeAccountsClient(accountRow: Record<string, unknown> | null): SupabaseContextClient {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: accountRow, error: null }),
              };
            },
          };
        },
      };
    },
  };
}

const accountRow = {
  id: "acct-1",
  business_name: "Acme HVAC",
  vertical: "hvac",
  plan_slug: "pro",
  greeting_name: "the Acme team",
  notification_contact_phone: null,
};

describe("buildRecipeContext — BUG-2", () => {
  it("throws RecipeMissingGhlCredsError when the credential loader returns no creds", async () => {
    await assert.rejects(
      () =>
        buildRecipeContext({
          accountId: "acct-1",
          agent,
          deps: {
            supabase: fakeAccountsClient(accountRow),
            getGhlCredentials: async () => {
              throw new RecipeMissingGhlCredsError("acct-1");
            },
          },
        }),
      RecipeMissingGhlCredsError,
    );
  });

  it("converts legacy 'No GHL credentials' error strings into the typed error", async () => {
    await assert.rejects(
      () =>
        buildRecipeContext({
          accountId: "acct-1",
          agent,
          deps: {
            supabase: fakeAccountsClient(accountRow),
            getGhlCredentials: async () => {
              // Mimic the previous inner throw from the default loader.
              throw new Error("No GHL credentials for account acct-1");
            },
          },
        }),
      RecipeMissingGhlCredsError,
    );
  });

  it("propagates unrelated errors untouched", async () => {
    await assert.rejects(
      () =>
        buildRecipeContext({
          accountId: "acct-1",
          agent,
          deps: {
            supabase: fakeAccountsClient(accountRow),
            getGhlCredentials: async () => {
              throw new Error("decrypt failed: HMAC mismatch");
            },
          },
        }),
      (err: unknown) =>
        err instanceof Error &&
        !(err instanceof RecipeMissingGhlCredsError) &&
        /decrypt failed/.test(err.message),
    );
  });
});
