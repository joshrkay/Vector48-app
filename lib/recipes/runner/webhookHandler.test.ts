import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  RecipeAgentNotFoundError,
  RecipeHandlerNotRegisteredError,
} from "./index.ts";
import {
  handleRecipeWebhook,
  type AuthenticateWebhookFn,
  type RunRecipeFn,
  type WebhookHandlerDeps,
  type WebhookSupabaseClient,
} from "./webhookHandler.ts";

// ── Fakes ───────────────────────────────────────────────────────────────

interface FakeSupabaseState {
  account?: { id: string; ghl_location_id: string | null } | null;
  accountError?: { message: string };
  eventInserts: Array<Record<string, unknown>>;
  insertError?: { message: string };
}

function fakeSupabase(state: FakeSupabaseState): WebhookSupabaseClient {
  return {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data:
                table === "accounts" ? (state.account ?? null) : null,
              error: state.accountError ?? null,
            }),
          }),
        }),
        insert: async (row) => {
          state.eventInserts.push(row);
          return { error: state.insertError ?? null };
        },
      };
    },
  };
}

function okAuth(): AuthenticateWebhookFn {
  return () => ({ ok: true, mode: "unsigned_test" as const });
}

function buildRequest(bodyObj: Record<string, unknown>): Request {
  return new Request("http://localhost/api/recipes/webhook/ai-phone-answering/acct-1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(bodyObj),
  });
}

const happyBody = {
  type: "CallCompleted",
  locationId: "loc-local",
  contactId: "ghl-caller-1",
  transcription: "Hi, this is Janet about a leak.",
};

function buildDeps(
  overrides: Partial<WebhookHandlerDeps> & { state?: FakeSupabaseState } = {},
): { deps: WebhookHandlerDeps; state: FakeSupabaseState } {
  const state: FakeSupabaseState = overrides.state ?? {
    account: { id: "acct-1", ghl_location_id: "loc-local" },
    eventInserts: [],
  };
  const deps: WebhookHandlerDeps = {
    supabase: overrides.supabase ?? fakeSupabase(state),
    authenticate: overrides.authenticate ?? okAuth(),
    runRecipe:
      overrides.runRecipe ??
      // Match the RecipeResult shape each handler now returns.
      (async () => ({
        outcome: "summary_sent",
        summary: "ai-phone-answering: summary sent to ghl-contact-owner",
        smsMessageId: "msg-42",
        automationDetail: {
          notification_contact_id: "ghl-contact-owner",
          sms_message_id: "msg-42",
        },
      })),
  };
  return { deps, state };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("handleRecipeWebhook", () => {
  it("returns 200 and the result on the happy path, and logs an automation_events row", async () => {
    const { deps, state } = buildDeps();
    const res = await handleRecipeWebhook(
      buildRequest(happyBody),
      { slug: "ai-phone-answering", accountId: "acct-1" },
      deps,
    );

    assert.equal(res.status, 200);
    const payload = (await res.json()) as {
      ok: boolean;
      result: { outcome: string; smsMessageId: string };
    };
    assert.equal(payload.ok, true);
    assert.equal(payload.result.outcome, "summary_sent");
    assert.equal(payload.result.smsMessageId, "msg-42");

    assert.equal(state.eventInserts.length, 1);
    const event = state.eventInserts[0];
    assert.equal(event.account_id, "acct-1");
    assert.equal(event.recipe_slug, "ai-phone-answering");
    assert.equal(event.event_type, "recipe_run");
    // summary (NOT NULL) + detail JSONB — matches 001_initial_schema.sql.
    // The handler provided a `summary` field so the route copies it
    // verbatim (it doesn't fall back to the `${slug}: ${outcome}` path).
    assert.equal(
      event.summary,
      "ai-phone-answering: summary sent to ghl-contact-owner",
    );
    assert.deepEqual(event.detail, {
      outcome: "summary_sent",
      notification_contact_id: "ghl-contact-owner",
      sms_message_id: "msg-42",
    });
  });

  it("falls back to `${slug}: ${outcome}` when the handler omits `summary`", async () => {
    const { deps, state } = buildDeps({
      runRecipe: async () => ({ outcome: "something_happened" }),
    });
    const res = await handleRecipeWebhook(
      buildRequest(happyBody),
      { slug: "ai-phone-answering", accountId: "acct-1" },
      deps,
    );
    assert.equal(res.status, 200);
    assert.equal(state.eventInserts.length, 1);
    assert.equal(
      state.eventInserts[0].summary,
      "ai-phone-answering: something_happened",
    );
    assert.deepEqual(state.eventInserts[0].detail, {
      outcome: "something_happened",
    });
  });

  it("returns 404 on an unsupported slug (handler never runs)", async () => {
    let runCalled = false;
    const { deps } = buildDeps({
      runRecipe: async () => {
        runCalled = true;
        return { outcome: "summary_sent" };
      },
    });
    const res = await handleRecipeWebhook(
      buildRequest(happyBody),
      { slug: "not-a-real-recipe", accountId: "acct-1" },
      deps,
    );

    assert.equal(res.status, 404);
    assert.equal(runCalled, false);
  });

  it("returns 401 when the signature check fails", async () => {
    let runCalled = false;
    const { deps } = buildDeps({
      authenticate: () => ({ ok: false, reason: "invalid_ed25519_signature" }),
      runRecipe: async () => {
        runCalled = true;
        return { outcome: "summary_sent" };
      },
    });
    const res = await handleRecipeWebhook(
      buildRequest(happyBody),
      { slug: "ai-phone-answering", accountId: "acct-1" },
      deps,
    );

    assert.equal(res.status, 401);
    const payload = (await res.json()) as { error: string; reason?: string };
    assert.equal(payload.error, "webhook_unauthorized");
    assert.equal(payload.reason, "invalid_ed25519_signature");
    assert.equal(runCalled, false);
  });

  it("returns 400 on malformed JSON body", async () => {
    const { deps } = buildDeps();
    const req = new Request(
      "http://localhost/api/recipes/webhook/ai-phone-answering/acct-1",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not valid json {",
      },
    );
    const res = await handleRecipeWebhook(
      req,
      { slug: "ai-phone-answering", accountId: "acct-1" },
      deps,
    );
    assert.equal(res.status, 400);
  });

  it("returns 404 when the URL accountId has no matching account row", async () => {
    const { deps } = buildDeps({
      state: { account: null, eventInserts: [] },
    });
    const res = await handleRecipeWebhook(
      buildRequest(happyBody),
      { slug: "ai-phone-answering", accountId: "acct-missing" },
      deps,
    );
    assert.equal(res.status, 404);
    const payload = (await res.json()) as { error: string };
    assert.equal(payload.error, "unknown_account");
  });

  it("returns 403 when the body's locationId does not belong to the URL account (tenant binding)", async () => {
    const { deps } = buildDeps({
      state: {
        account: { id: "acct-1", ghl_location_id: "loc-legit" },
        eventInserts: [],
      },
    });
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      const res = await handleRecipeWebhook(
        buildRequest({ ...happyBody, locationId: "loc-attacker" }),
        { slug: "ai-phone-answering", accountId: "acct-1" },
        deps,
      );
      assert.equal(res.status, 403);
      const payload = (await res.json()) as { error: string };
      assert.equal(payload.error, "tenant_binding_mismatch");
    } finally {
      console.warn = originalWarn;
    }
  });

  it("allows the request through when the body has no locationId (local smoke path)", async () => {
    const { deps } = buildDeps();
    const { locationId: _locationId, ...bodyWithoutLocation } = happyBody;
    void _locationId;
    const res = await handleRecipeWebhook(
      buildRequest(bodyWithoutLocation),
      { slug: "ai-phone-answering", accountId: "acct-1" },
      deps,
    );
    assert.equal(res.status, 200);
  });

  it("returns 500 when Supabase read fails during tenant binding", async () => {
    const originalError = console.error;
    console.error = () => {};
    try {
      const { deps } = buildDeps({
        state: {
          account: null,
          accountError: { message: "connection reset" },
          eventInserts: [],
        },
      });
      const res = await handleRecipeWebhook(
        buildRequest(happyBody),
        { slug: "ai-phone-answering", accountId: "acct-1" },
        deps,
      );
      assert.equal(res.status, 500);
      const payload = (await res.json()) as { error: string };
      assert.equal(payload.error, "internal_error");
    } finally {
      console.error = originalError;
    }
  });

  it("returns 404 when runRecipe throws RecipeAgentNotFoundError", async () => {
    const { deps } = buildDeps({
      runRecipe: async () => {
        throw new RecipeAgentNotFoundError("acct-1", "ai-phone-answering");
      },
    });
    const res = await handleRecipeWebhook(
      buildRequest(happyBody),
      { slug: "ai-phone-answering", accountId: "acct-1" },
      deps,
    );
    assert.equal(res.status, 404);
    const payload = (await res.json()) as { error: string; message: string };
    assert.equal(payload.error, "agent_not_configured");
    assert.match(payload.message, /No active tenant_agents row/);
  });

  it("returns 501 when runRecipe throws RecipeHandlerNotRegisteredError", async () => {
    const { deps } = buildDeps({
      runRecipe: async () => {
        throw new RecipeHandlerNotRegisteredError("ai-phone-answering");
      },
    });
    const res = await handleRecipeWebhook(
      buildRequest(happyBody),
      { slug: "ai-phone-answering", accountId: "acct-1" },
      deps,
    );
    assert.equal(res.status, 501);
  });

  it("returns a generic 500 on unexpected runRecipe errors (does NOT leak err.message)", async () => {
    const originalError = console.error;
    console.error = () => {};
    try {
      const { deps } = buildDeps({
        runRecipe: async () => {
          throw new Error(
            "DANGEROUS SECRET DATABASE STRING: pg://admin:hunter2@prod",
          );
        },
      });
      const res = await handleRecipeWebhook(
        buildRequest(happyBody),
        { slug: "ai-phone-answering", accountId: "acct-1" },
        deps,
      );
      assert.equal(res.status, 500);
      const raw = await res.text();
      assert.equal(raw.includes("DANGEROUS"), false, "err.message must not leak");
      assert.equal(raw.includes("hunter2"), false, "err.message must not leak");
      assert.match(raw, /internal_error/);
    } finally {
      console.error = originalError;
    }
  });

  it("does not fail the response when automation_events insert throws", async () => {
    const originalError = console.error;
    console.error = () => {};
    try {
      const { deps } = buildDeps({
        state: {
          account: { id: "acct-1", ghl_location_id: "loc-local" },
          eventInserts: [],
          insertError: { message: "log table down" },
        },
      });
      const res = await handleRecipeWebhook(
        buildRequest(happyBody),
        { slug: "ai-phone-answering", accountId: "acct-1" },
        deps,
      );
      // runRecipe succeeded, so even though logging fails we still 200.
      assert.equal(res.status, 200);
    } finally {
      console.error = originalError;
    }
  });
});
