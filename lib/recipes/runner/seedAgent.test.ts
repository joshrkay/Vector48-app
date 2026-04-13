import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RecipeArchetype } from "./archetypes.ts";
import {
  SeedAccountNotFoundError,
  UnknownRecipeArchetypeError,
  seedAgentFromArchetype,
  type SeedSupabaseClient,
  type SeededAgentRow,
  type TenantAgentInsert,
} from "./seedAgent.ts";

interface FakeSupabaseSpy {
  client: SeedSupabaseClient;
  accountSelectCalls: Array<{ col: string; value: string }>;
  tenantAgentLookupCalls: Array<{ accountId: string; recipeSlug: string }>;
  insertRow: TenantAgentInsert | null;
}

interface FakeSupabaseOptions {
  account?: {
    id: string;
    business_name: string | null;
    vertical: string | null;
    greeting_name: string | null;
  } | null;
  accountError?: { message: string };
  existingAgent?: SeededAgentRow | null;
  existingLookupError?: { message: string };
  insertError?: { message: string };
}

function fakeSupabase(options: FakeSupabaseOptions): FakeSupabaseSpy {
  const spy: FakeSupabaseSpy = {
    client: null as unknown as SeedSupabaseClient,
    accountSelectCalls: [],
    tenantAgentLookupCalls: [],
    insertRow: null,
  };

  const client: SeedSupabaseClient = {
    from(table: string) {
      if (table === "accounts") {
        return {
          select: () => ({
            eq: (col: string, value: string) => {
              spy.accountSelectCalls.push({ col, value });
              // The accounts lookup only uses .eq(...).maybeSingle() —
              // the chained .eq path is never exercised on this table
              // but we still have to supply it to satisfy the type.
              return {
                maybeSingle: async () => ({
                  data: options.account ?? null,
                  error: options.accountError ?? null,
                }),
                eq: () => ({
                  maybeSingle: async () => ({
                    data: null,
                    error: null,
                  }),
                }),
              };
            },
          }),
          insert: () => {
            throw new Error("insert should not be called on accounts");
          },
        };
      }
      if (table === "tenant_agents") {
        return {
          select: () => ({
            eq: (firstCol: string, firstVal: string) => {
              // First .eq captures account_id; the chained second .eq
              // captures recipe_slug. Then .maybeSingle() resolves.
              return {
                maybeSingle: async () => ({
                  data: null,
                  error: null,
                }),
                eq: (secondCol: string, secondVal: string) => {
                  spy.tenantAgentLookupCalls.push({
                    accountId: firstCol === "account_id" ? firstVal : "",
                    recipeSlug: secondCol === "recipe_slug" ? secondVal : "",
                  });
                  return {
                    maybeSingle: async () => ({
                      data: options.existingAgent ?? null,
                      error: options.existingLookupError ?? null,
                    }),
                  };
                },
              };
            },
          }),
          insert: (row) => {
            spy.insertRow = row;
            return {
              select: () => ({
                single: async () => ({
                  data: options.insertError
                    ? null
                    : ({ id: "ta-seeded", ...row } as SeededAgentRow),
                  error: options.insertError ?? null,
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
  it("resolves placeholders and inserts a tenant_agents row when missing", async () => {
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

    // Looked up existing row by composite (account_id, recipe_slug) first.
    assert.deepEqual(spy.tenantAgentLookupCalls, [
      { accountId: "acct-1", recipeSlug: "ai-phone-answering" },
    ]);

    // Placeholders resolved against the account row.
    assert.ok(spy.insertRow);
    assert.equal(
      spy.insertRow!.system_prompt,
      "Summarize calls for Test HVAC, a hvac company.",
    );

    // Archetype defaults propagated.
    assert.equal(spy.insertRow!.model, "claude-haiku-4-5");
    assert.equal(spy.insertRow!.max_tokens, 300);
    assert.equal(spy.insertRow!.monthly_spend_cap_micros, 5_000_000);
    assert.equal(spy.insertRow!.rate_limit_per_hour, 60);
    assert.equal(spy.insertRow!.status, "active");

    // Returned row has an id.
    assert.equal(row.id, "ta-seeded");
  });

  it("returns the existing row unchanged when one already exists (preserves tenant edits)", async () => {
    const existing: SeededAgentRow = {
      id: "agent-existing",
      account_id: "acct-1",
      recipe_slug: "ai-phone-answering",
      display_name: "My Custom Name",
      system_prompt: "A prompt the tenant wrote themselves",
      model: "claude-sonnet-4-6", // Tenant upgraded from Haiku
      max_tokens: 1024,
      temperature: 0.5,
      voice_id: null,
      tool_config: { enabledTools: [] },
      monthly_spend_cap_micros: 20_000_000, // Tenant raised their own cap
      rate_limit_per_hour: 60,
      status: "active",
    };

    const spy = fakeSupabase({
      account: {
        id: "acct-1",
        business_name: "Test HVAC",
        vertical: "hvac",
        greeting_name: null,
      },
      existingAgent: existing,
    });

    const row = await seedAgentFromArchetype(
      { accountId: "acct-1", recipeSlug: "ai-phone-answering" },
      { client: spy.client, getArchetype: fakeGetArchetype },
    );

    // Returns the pre-existing row verbatim.
    assert.deepEqual(row, existing);

    // Does NOT fetch the account row (no need when the existing row wins).
    assert.equal(spy.accountSelectCalls.length, 0);

    // Does NOT insert anything.
    assert.equal(spy.insertRow, null);
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

    assert.ok(spy.insertRow);
    // business_name -> "the business", vertical -> "home services"
    assert.equal(
      spy.insertRow!.system_prompt,
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

    assert.deepEqual(spy.insertRow!.tool_config, {
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

    assert.equal(spy.insertRow!.model, "claude-sonnet-4-6");
    assert.equal(spy.insertRow!.max_tokens, 1024);
    assert.equal(spy.insertRow!.monthly_spend_cap_micros, 10_000_000);
    assert.equal(spy.insertRow!.rate_limit_per_hour, 30);
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

  it("wraps Supabase account-read errors into a descriptive Error", async () => {
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

  it("wraps existing-row lookup errors into a descriptive Error", async () => {
    const spy = fakeSupabase({
      account: {
        id: "acct-7",
        business_name: "Acme",
        vertical: "hvac",
        greeting_name: null,
      },
      existingLookupError: { message: "transient db error" },
    });

    await assert.rejects(
      () =>
        seedAgentFromArchetype(
          { accountId: "acct-7", recipeSlug: "ai-phone-answering" },
          { client: spy.client, getArchetype: fakeGetArchetype },
        ),
      /transient db error/,
    );
  });

  it("wraps Supabase insert errors into a descriptive Error", async () => {
    const spy = fakeSupabase({
      account: {
        id: "acct-6",
        business_name: "Acme",
        vertical: "hvac",
        greeting_name: null,
      },
      insertError: { message: "unique violation" },
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
