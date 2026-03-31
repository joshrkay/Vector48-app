import test from "node:test";
import assert from "node:assert/strict";
import { runDeactivateRecipe, type DeactivateRecipeEnv, type RecipeActivationRow } from "./deactivateRecipeRun";

const activeRow = (overrides: Partial<RecipeActivationRow> = {}): RecipeActivationRow => ({
  id: "act-1",
  status: "active",
  webhook_id: "wh_1",
  ...overrides,
});

function env(partial: Partial<DeactivateRecipeEnv>): DeactivateRecipeEnv {
  return {
    getActivation: async () => ({ data: null, errorMessage: null }),
    getGhlIntegration: async () => ({ data: null, errorMessage: null }),
    deleteWebhook: async () => ({ ok: true }),
    markInactive: async () => ({ errorMessage: null }),
    ...partial,
  };
}

const noToken = (): string | null => null;
const fixedToken = (): string | null => "tok";

test("returns 404 when activation is missing", async () => {
  const r = await runDeactivateRecipe(noToken,
    env({
      getActivation: async () => ({ data: null, errorMessage: null }),
    }),
  );
  assert.equal(r.status, 404);
  assert.equal(r.body.error, "Recipe activation not found");
});

test("returns 200 already_inactive when status is inactive", async () => {
  const r = await runDeactivateRecipe(noToken,
    env({
      getActivation: async () => ({
        data: activeRow({ status: "inactive", webhook_id: null }),
        errorMessage: null,
      }),
    }),
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.already_inactive, true);
  assert.equal(r.body.activation_id, "act-1");
});

test("returns 500 on activation read error", async () => {
  const r = await runDeactivateRecipe(noToken,
    env({
      getActivation: async () => ({ data: null, errorMessage: "db down" }),
    }),
  );
  assert.equal(r.status, 500);
  assert.equal(r.body.error, "db down");
});

test("returns 412 when integration is missing", async () => {
  const r = await runDeactivateRecipe(fixedToken,
    env({
      getActivation: async () => ({ data: activeRow({ webhook_id: null }), errorMessage: null }),
      getGhlIntegration: async () => ({ data: null, errorMessage: null }),
    }),
  );
  assert.equal(r.status, 412);
});

test("returns 412 when token cannot be resolved from credentials", async () => {
  const r = await runDeactivateRecipe(noToken,
    env({
      getActivation: async () => ({ data: activeRow({ webhook_id: null }), errorMessage: null }),
      getGhlIntegration: async () => ({
        data: { credentials_encrypted: {} },
        errorMessage: null,
      }),
    }),
  );
  assert.equal(r.status, 412);
});

test("returns 502 when webhook delete fails", async () => {
  const r = await runDeactivateRecipe(fixedToken,
    env({
      getActivation: async () => ({ data: activeRow(), errorMessage: null }),
      getGhlIntegration: async () => ({
        data: { credentials_encrypted: { access_token: "tok" } },
        errorMessage: null,
      }),
      deleteWebhook: async () => ({ error: "GHL webhook delete failed (500)" }),
    }),
  );
  assert.equal(r.status, 502);
});

test("skips delete when webhook_id is null and marks inactive", async () => {
  let deleted = false;
  let patch: { id: string; at: string } | null = null;
  const r = await runDeactivateRecipe(fixedToken,
    env({
      getActivation: async () => ({
        data: activeRow({ webhook_id: null }),
        errorMessage: null,
      }),
      getGhlIntegration: async () => ({
        data: { credentials_encrypted: { access_token: "tok" } },
        errorMessage: null,
      }),
      deleteWebhook: async () => {
        deleted = true;
        return { ok: true };
      },
      markInactive: async (id, at) => {
        patch = { id, at };
        return { errorMessage: null };
      },
    }),
  );
  assert.equal(deleted, false);
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal((patch as { id: string; at: string } | null)?.id, "act-1");
  assert.ok(typeof (patch as { id: string; at: string } | null)?.at === "string");
});

test("returns 500 when markInactive fails", async () => {
  const r = await runDeactivateRecipe(fixedToken,
    env({
      getActivation: async () => ({
        data: activeRow({ webhook_id: null }),
        errorMessage: null,
      }),
      getGhlIntegration: async () => ({
        data: { credentials_encrypted: { access_token: "tok" } },
        errorMessage: null,
      }),
      markInactive: async () => ({ errorMessage: "constraint" }),
    }),
  );
  assert.equal(r.status, 500);
  assert.equal(r.body.error, "constraint");
});

test("deletes webhook then marks inactive on success", async () => {
  const calls: string[] = [];
  const r = await runDeactivateRecipe(fixedToken,
    env({
      getActivation: async () => ({ data: activeRow(), errorMessage: null }),
      getGhlIntegration: async () => ({
        data: { credentials_encrypted: { access_token: "tok" } },
        errorMessage: null,
      }),
      deleteWebhook: async (token, wh) => {
        calls.push(`${token}:${wh}`);
        return { ok: true };
      },
      markInactive: async () => ({ errorMessage: null }),
    }),
  );
  assert.deepEqual(calls, ["tok:wh_1"]);
  assert.equal(r.status, 200);
  assert.equal(r.body.activation_id, "act-1");
  assert.ok(typeof r.body.deactivated_at === "string");
});
