import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RecipeArchetype } from "./archetypes.ts";
import {
  SeedAccountNotFoundError,
  UnknownRecipeArchetypeError,
  seedAgentFromArchetype,
  type SeedSupabaseClient,
  type TenantAgentInsert,
} from "./seedAgent.ts";

interface FakeSupabaseSpy {
  client: SeedSupabaseClient;
  accountSelectCalls: Array<{ col: string; value: string }>;
  upsertRow: TenantAgentInsert | null;
  upsertOnConflict: string | null;
}

function fakeSupabase(options: {
  account?: {
    id: string;
    business_name: string | null;
    vertical: string | null;
    greeting_name: string | null;
  } | null;
  accountError?: { message: string };
  upsertError?: { message: string };
}): FakeSupabaseSpy {
  const spy: FakeSupabaseSpy = {
    client: null as unknown as SeedSupabaseClient,
    accountSelectCalls: [],
    upsertRow: null,
    upsertOnConflict: null,
  };

  const client: SeedSupabaseClient = {
    from(table: string) {
      if (table === "accounts") {
        return {
          select: () => ({
            eq: (col: string, value: string) => {
              spy.accountSelectCalls.push({ col, value });
              return {
                maybeSingle: async () => ({
                  data: options.account ?? null,
                  error: options.accountError ?? null,
                }),
              };
            },
          }),
          // unused for accounts table
          upsert: () => {
            throw new Error("upsert should not be called on accounts");
          },
        };
      }
      if (table === "tenant_agents") {
        return {
          select: () => {
            throw new Error("select should not be called on tenant_agents");
          },
          upsert: (row, opts) => {
            spy.upsertRow = row;
            spy.upsertOnConflict = opts.onConflict;
            return {
              select: () => ({
                single: async () => ({
                  data: options.upsertError
                    ? null
                    : ({ id: "ta-seeded", ...row } as never),
                  error: options.upsertError ?? null,
                }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };

  spy.client = client;
  return spy;
}

const archetypeStub: RecipeArchetype = {
  slug: "ai-phone-answering",
  displayName: "AI Phone Receptionist",
  systemPrompt:
    "Summarize calls for {{business_name}}, a {{vertical}} company.",
  model: "claude-haiku-4-5",
  maxTokens: 300,
  temperature: 0.3,
  toolConfig: { enabledTools: [] },
  monthlySpendCapMicros: 5_000_000,
  rateLimitPerHour: 60,
};

const fakeGetArchetype = (slug: string) =>
  slug === archetypeStub.slug ? archetypeStub : null;

describe("seedAgentFromArchetype", () => {
  it("resolves placeholders and upserts a tenant_agents row", async () => {
    const spy = fakeSupabase({
      account: {
        id: "acct-1",
        business_name: "Test HVAC",
        vertical: "hvac",
        greeting_name: null,
      },
    });

    const row = await seedAgentFromArchetype(
      { accountId: "acct-1", recipeSlug: "ai-phone-answering" },
      { client: spy.client, getArchetype: fakeGetArchetype },
    );

    // Fetched the right account.
    assert.deepEqual(spy.accountSelectCalls, [{ col: "id", value: "acct-1" }]);

    // Upsert keyed on (account_id, recipe_slug).
    assert.equal(spy.upsertOnConflict, "account_id,recipe_slug");

    // Placeholders resolved against the account row.
    assert.ok(spy.upsertRow);
    assert.equal(
      spy.upsertRow!.system_prompt,
      "Summarize calls for Test HVAC, a hvac company.",
    );

    // Archetype defaults propagated.
    assert.equal(spy.upsertRow!.model, "claude-haiku-4-5");
    assert.equal(spy.upsertRow!.max_tokens, 300);
    assert.equal(spy.upsertRow!.monthly_spend_cap_micros, 5_000_000);
    assert.equal(spy.upsertRow!.rate_limit_per_hour, 60);
    assert.equal(spy.upsertRow!.status, "active");

    // Returned row has an id.
    assert.equal(row.id, "ta-seeded");
  });

  it("falls back to safe defaults when account fields are null", async () => {
    const spy = fakeSupabase({
      account: {
        id: "acct-2",
        business_name: null,
        vertical: null,
        greeting_name: null,
      },
    });

    await seedAgentFromArchetype(
      { accountId: "acct-2", recipeSlug: "ai-phone-answering" },
      { client: spy.client, getArchetype: fakeGetArchetype },
    );

    assert.ok(spy.upsertRow);
    // business_name -> "the business", vertical -> "home services"
    assert.equal(
      spy.upsertRow!.system_prompt,
      "Summarize calls for the business, a home services company.",
    );
  });

  it("merges override tool_config into the archetype tool_config", async () => {
    const spy = fakeSupabase({
      account: {
        id: "acct-3",
        business_name: "Acme",
        vertical: "plumbing",
        greeting_name: null,
      },
    });

    await seedAgentFromArchetype(
      {
        accountId: "acct-3",
        recipeSlug: "ai-phone-answering",
        overrides: {
          tool_config: { notification_contact_id: "ghl-contact-owner-9" },
        },
      },
      { client: spy.client, getArchetype: fakeGetArchetype },
    );

    assert.deepEqual(spy.upsertRow!.tool_config, {
      enabledTools: [],
      notification_contact_id: "ghl-contact-owner-9",
    });
  });

  it("allows overriding model / max_tokens / spend cap at seed time", async () => {
    const spy = fakeSupabase({
      account: {
        id: "acct-4",
        business_name: "Acme",
        vertical: "hvac",
        greeting_name: null,
      },
    });

    await seedAgentFromArchetype(
      {
        accountId: "acct-4",
        recipeSlug: "ai-phone-answering",
        overrides: {
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          monthly_spend_cap_micros: 10_000_000,
          rate_limit_per_hour: 30,
        },
      },
      { client: spy.client, getArchetype: fakeGetArchetype },
    );

    assert.equal(spy.upsertRow!.model, "claude-sonnet-4-6");
    assert.equal(spy.upsertRow!.max_tokens, 1024);
    assert.equal(spy.upsertRow!.monthly_spend_cap_micros, 10_000_000);
    assert.equal(spy.upsertRow!.rate_limit_per_hour, 30);
  });

  it("throws UnknownRecipeArchetypeError for a slug with no archetype", async () => {
    const spy = fakeSupabase({
      account: {
        id: "acct-5",
        business_name: "Acme",
        vertical: "hvac",
        greeting_name: null,
      },
    });

    await assert.rejects(
      () =>
        seedAgentFromArchetype(
          { accountId: "acct-5", recipeSlug: "not-a-real-recipe" },
          { client: spy.client, getArchetype: fakeGetArchetype },
        ),
      (err: unknown) =>
        err instanceof UnknownRecipeArchetypeError &&
        err.recipeSlug === "not-a-real-recipe",
    );

    // We never fetched the account since archetype lookup failed first.
    assert.equal(spy.accountSelectCalls.length, 0);
  });

  it("throws SeedAccountNotFoundError when the account row is missing", async () => {
    const spy = fakeSupabase({ account: null });

    await assert.rejects(
      () =>
        seedAgentFromArchetype(
          { accountId: "acct-missing", recipeSlug: "ai-phone-answering" },
          { client: spy.client, getArchetype: fakeGetArchetype },
        ),
      (err: unknown) =>
        err instanceof SeedAccountNotFoundError &&
        err.accountId === "acct-missing",
    );
  });

  it("wraps Supabase read errors into a descriptive Error", async () => {
    const spy = fakeSupabase({
      account: null,
      accountError: { message: "connection reset" },
    });

    await assert.rejects(
      () =>
        seedAgentFromArchetype(
          { accountId: "acct-err", recipeSlug: "ai-phone-answering" },
          { client: spy.client, getArchetype: fakeGetArchetype },
        ),
      /connection reset/,
    );
  });

  it("wraps Supabase upsert errors into a descriptive Error", async () => {
    const spy = fakeSupabase({
      account: {
        id: "acct-6",
        business_name: "Acme",
        vertical: "hvac",
        greeting_name: null,
      },
      upsertError: { message: "unique violation" },
    });

    await assert.rejects(
      () =>
        seedAgentFromArchetype(
          { accountId: "acct-6", recipeSlug: "ai-phone-answering" },
          { client: spy.client, getArchetype: fakeGetArchetype },
        ),
      /unique violation/,
    );
  });
});
