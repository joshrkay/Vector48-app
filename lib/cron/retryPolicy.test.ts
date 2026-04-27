import test from "node:test";
import assert from "node:assert/strict";
import { resolveRecipeTriggerMaxAttempts } from "./retryPolicy.ts";

test("uses row-level retry policy when configured", () => {
  assert.equal(resolveRecipeTriggerMaxAttempts(1, 3), 1);
  assert.equal(resolveRecipeTriggerMaxAttempts(5, 3), 5);
});

test("falls back to default policy for existing rows without max_attempts", () => {
  assert.equal(resolveRecipeTriggerMaxAttempts(null, 3), 3);
  assert.equal(resolveRecipeTriggerMaxAttempts(undefined, 3), 3);
});

test("guards against invalid values to prevent infinite retries", () => {
  assert.equal(resolveRecipeTriggerMaxAttempts(0, 3), 3);
  assert.equal(resolveRecipeTriggerMaxAttempts(-2, 3), 3);
  assert.equal(resolveRecipeTriggerMaxAttempts(Number.NaN, 3), 3);
  assert.equal(resolveRecipeTriggerMaxAttempts(0, 0), 1);
});
