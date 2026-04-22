import test from "node:test";
import assert from "node:assert/strict";
import { runRecipeTriggerSweep } from "./recipeTriggerSweep.ts";

type TriggerRow = {
  id: string;
  account_id: string;
  recipe_slug: string;
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
    async hasActiveActivation(accountId: string, recipeSlug: string) {
      if (!state.activeKeys) return true;
      return state.activeKeys.has(`${accountId}:${recipeSlug}`);
    },
    async markCompleted(id: string) {
      state.completed.push(id);
    },
    async markFailed(id: string, payload: { message: string; attemptCount: number; processedAt: string }) {
      state.failed.push({ id, ...payload });
    },
  };
}

test("succeeds with empty batch even when N8N base is missing", async () => {
  const result = await runRecipeTriggerSweep({
    n8nBaseUrl: "",
    nowIso: "2026-03-31T15:00:00.000Z",
    batchLimit: 50,
    store: makeStore({ due: [], completed: [], failed: [] }),
    fetcher: async () => new Response(null, { status: 200 }),
  });

  // Empty batch succeeds regardless of n8n config
  assert.deepEqual(result, {
    ok: true,
    processed: 0,
    failed: 0,
    skipped: 0,
    batch_limit: 50,
  });
});

test("fails n8n trigger when N8N_BASE_URL is empty", async () => {
  const state: StoreState = {
    due: [
      {
        id: "trg-n8n-nobase",
        account_id: "acc-1",
        recipe_slug: "appointment-reminder", // n8n recipe
        payload: null,
        attempt_count: 0,
      },
    ],
    completed: [],
    failed: [],
  };

  const result = await runRecipeTriggerSweep({
    n8nBaseUrl: "",
    nowIso: "2026-03-31T15:00:00.000Z",
    batchLimit: 50,
    store: makeStore(state),
    fetcher: async () => new Response(null, { status: 200 }),
  });

  assert.equal(result.ok, true);
  assert.equal(state.failed.length, 1);
  assert.ok(state.failed[0]?.message.includes("N8N_BASE_URL"));
});

test("processes active queued trigger and marks completed", async () => {
  const state: StoreState = {
    due: [
      {
        id: "trg-1",
        account_id: "acc-1",
        recipe_slug: "recipe-a",
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
        recipe_slug: "recipe-b",
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

test("routes GHL-native trigger to ghlExecutor", async () => {
  const state: StoreState = {
    due: [
      {
        id: "trg-ghl",
        account_id: "acc-1",
        recipe_slug: "seasonal-demand-outreach", // GHL-native
        payload: { contact_id: "c1", contact_name: "John" },
        attempt_count: 0,
      },
    ],
    activeKeys: new Set(["acc-1:seasonal-demand-outreach"]),
    completed: [],
    failed: [],
  };

  let executorCalled = false;
  let executorParams: unknown = null;

  const result = await runRecipeTriggerSweep({
    n8nBaseUrl: "https://n8n.example.com",
    nowIso: "2026-03-31T15:00:00.000Z",
    batchLimit: 50,
    store: makeStore(state),
    fetcher: async () => {
      throw new Error("should not call n8n for GHL-native");
    },
    ghlExecutor: async (params) => {
      executorCalled = true;
      executorParams = params;
      return { ok: true };
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.processed, 1);
  assert.equal(executorCalled, true);
  assert.deepEqual(executorParams, {
    accountId: "acc-1",
    recipeSlug: "seasonal-demand-outreach",
    contactId: "c1",
    triggerData: { contact_id: "c1", contact_name: "John" },
  });
  assert.equal(state.completed.length, 1);
});

test("fails GHL-native trigger when contact_id is missing", async () => {
  const state: StoreState = {
    due: [
      {
        id: "trg-ghl-nocontact",
        account_id: "acc-1",
        recipe_slug: "customer-reactivation",
        payload: { some_data: "value" },
        attempt_count: 0,
      },
    ],
    completed: [],
    failed: [],
  };

  const result = await runRecipeTriggerSweep({
    n8nBaseUrl: "https://n8n.example.com",
    nowIso: "2026-03-31T15:00:00.000Z",
    batchLimit: 50,
    store: makeStore(state),
    fetcher: async () => new Response(null, { status: 200 }),
    ghlExecutor: async () => ({ ok: true }),
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.failed, 1);
  assert.ok(state.failed[0]?.message.includes("contact_id"));
});

test("handles mixed n8n and GHL-native triggers", async () => {
  const state: StoreState = {
    due: [
      {
        id: "trg-n8n",
        account_id: "acc-1",
        recipe_slug: "lead-qualification",
        payload: { contact_id: "c1" },
        attempt_count: 0,
      },
      {
        id: "trg-ghl",
        account_id: "acc-1",
        recipe_slug: "seasonal-demand-outreach",
        payload: { contact_id: "c2" },
        attempt_count: 0,
      },
    ],
    completed: [],
    failed: [],
  };

  let fetchCount = 0;
  let executorCount = 0;

  const result = await runRecipeTriggerSweep({
    n8nBaseUrl: "https://n8n.example.com",
    nowIso: "2026-03-31T15:00:00.000Z",
    batchLimit: 50,
    store: makeStore(state),
    fetcher: async () => {
      fetchCount += 1;
      return new Response(null, { status: 200 });
    },
    ghlExecutor: async () => {
      executorCount += 1;
      return { ok: true };
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.processed, 2);
  assert.equal(fetchCount, 1); // only n8n recipe hits webhook
  assert.equal(executorCount, 1); // only GHL-native recipe hits executor
});

test("skips rows that cannot be claimed", async () => {
  const state: StoreState = {
    due: [
      {
        id: "trg-3",
        account_id: "acc-3",
        recipe_slug: "recipe-c",
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
