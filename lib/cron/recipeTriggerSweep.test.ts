import test from "node:test";
import assert from "node:assert/strict";
import { runRecipeTriggerSweep } from "./recipeTriggerSweep.ts";

type TriggerRow = {
  id: string;
  account_id: string;
  recipe_id: string;
  payload: Record<string, unknown> | null;
  attempt_count: number;
};

type StoreState = {
  due: TriggerRow[];
  claimableIds?: Set<string>;
  activeKeys?: Set<string>;
  completed: string[];
  failed: Array<{ id: string; message: string; attemptCount: number; processedAt: string }>;
};

function makeStore(state: StoreState) {
  return {
    async listDue() {
      return state.due;
    },
    async claim(id: string) {
      return state.claimableIds ? state.claimableIds.has(id) : true;
    },
    async hasActiveActivation(accountId: string, recipeId: string) {
      if (!state.activeKeys) return true;
      return state.activeKeys.has(`${accountId}:${recipeId}`);
    },
    async markCompleted(id: string) {
      state.completed.push(id);
    },
    async markFailed(id: string, payload: { message: string; attemptCount: number; processedAt: string }) {
      state.failed.push({ id, ...payload });
    },
  };
}

test("returns env error when N8N base is missing", async () => {
  const result = await runRecipeTriggerSweep({
    n8nBaseUrl: "",
    nowIso: "2026-03-31T15:00:00.000Z",
    batchLimit: 50,
    store: makeStore({ due: [], completed: [], failed: [] }),
    fetcher: async () => new Response(null, { status: 200 }),
  });

  assert.deepEqual(result, {
    ok: false,
    status: 500,
    error: "N8N_BASE_URL is not configured",
  });
});

test("processes active queued trigger and marks completed", async () => {
  const state: StoreState = {
    due: [
      {
        id: "trg-1",
        account_id: "acc-1",
        recipe_id: "recipe-a",
        payload: { appointment_id: "apt-1" },
        attempt_count: 0,
      },
    ],
    activeKeys: new Set(["acc-1:recipe-a"]),
    completed: [],
    failed: [],
  };

  let fetchedUrl = "";
  let fetchedBody = "";

  const result = await runRecipeTriggerSweep({
    n8nBaseUrl: "https://n8n.example.com",
    nowIso: "2026-03-31T15:00:00.000Z",
    batchLimit: 50,
    store: makeStore(state),
    fetcher: async (url, init) => {
      fetchedUrl = url;
      fetchedBody = String(init?.body ?? "");
      return new Response(null, { status: 200 });
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result, {
    ok: true,
    processed: 1,
    failed: 0,
    skipped: 0,
    batch_limit: 50,
  });
  assert.equal(state.completed.length, 1);
  assert.equal(state.completed[0], "trg-1");
  assert.equal(state.failed.length, 0);
  assert.ok(fetchedUrl.includes("/webhook/ghl/recipe-scheduled-trigger"));
  assert.ok(fetchedUrl.includes("recipe_id=recipe-a"));
  assert.ok(fetchedUrl.includes("account_id=acc-1"));
  assert.ok(fetchedBody.includes("appointment_id"));
});

test("marks failed when activation is missing", async () => {
  const state: StoreState = {
    due: [
      {
        id: "trg-2",
        account_id: "acc-2",
        recipe_id: "recipe-b",
        payload: null,
        attempt_count: 2,
      },
    ],
    activeKeys: new Set(),
    completed: [],
    failed: [],
  };

  const result = await runRecipeTriggerSweep({
    n8nBaseUrl: "https://n8n.example.com",
    nowIso: "2026-03-31T15:00:00.000Z",
    batchLimit: 10,
    store: makeStore(state),
    fetcher: async () => new Response(null, { status: 200 }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result, {
    ok: true,
    processed: 0,
    failed: 1,
    skipped: 0,
    batch_limit: 10,
  });
  assert.equal(state.completed.length, 0);
  assert.equal(state.failed.length, 1);
  assert.equal(state.failed[0]?.id, "trg-2");
  assert.equal(state.failed[0]?.attemptCount, 3);
  assert.ok(state.failed[0]?.message.includes("No active recipe activation"));
});

test("skips rows that cannot be claimed", async () => {
  const state: StoreState = {
    due: [
      {
        id: "trg-3",
        account_id: "acc-3",
        recipe_id: "recipe-c",
        payload: null,
        attempt_count: 0,
      },
    ],
    claimableIds: new Set(),
    completed: [],
    failed: [],
  };

  const result = await runRecipeTriggerSweep({
    n8nBaseUrl: "https://n8n.example.com",
    nowIso: "2026-03-31T15:00:00.000Z",
    batchLimit: 10,
    store: makeStore(state),
    fetcher: async () => new Response(null, { status: 200 }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result, {
    ok: true,
    processed: 0,
    failed: 0,
    skipped: 1,
    batch_limit: 10,
  });
  assert.equal(state.completed.length, 0);
  assert.equal(state.failed.length, 0);
});
