import test from "node:test";
import assert from "node:assert/strict";
import { deleteGhlRecipeWebhook } from "./ghlRecipeWebhooks";

test("deleteGhlRecipeWebhook succeeds on 200", async () => {
  const fetchFn = async () => new Response(null, { status: 200 });
  const r = await deleteGhlRecipeWebhook("tok", "wh_1", fetchFn);
  assert.deepEqual(r, { ok: true });
});

test("deleteGhlRecipeWebhook treats 404 as success", async () => {
  const fetchFn = async () => new Response(null, { status: 404 });
  const r = await deleteGhlRecipeWebhook("tok", "wh_1", fetchFn);
  assert.deepEqual(r, { ok: true });
});

test("deleteGhlRecipeWebhook returns error on other status", async () => {
  const fetchFn = async () => new Response(null, { status: 500 });
  const r = await deleteGhlRecipeWebhook("tok", "wh_1", fetchFn);
  assert.ok("error" in r);
  assert.ok(r.error.includes("500"));
});
