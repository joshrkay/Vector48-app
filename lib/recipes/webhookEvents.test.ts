import test from "node:test";
import assert from "node:assert/strict";
import { getWebhookEventsForRecipe, hasRecipeWebhookConfig } from "./webhookEvents.ts";

test("returns recipe-specific event list for known recipe", () => {
  const events = getWebhookEventsForRecipe("ai-phone-answering");
  assert.deepEqual(events, ["InboundMessage", "Call", "ContactCreate", "ContactUpdate"]);
});

test("returns fallback event list for unknown recipe", () => {
  const events = getWebhookEventsForRecipe("unknown-recipe");
  assert.deepEqual(events, ["ContactCreate", "ContactUpdate"]);
});

test("reports whether a recipe has explicit webhook config", () => {
  assert.equal(hasRecipeWebhookConfig("missed-call-text-back"), true);
  assert.equal(hasRecipeWebhookConfig("unknown-recipe"), false);
});
