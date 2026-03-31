import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRecipeScheduledWebhookUrl,
  buildRecipeTriggerPostBody,
  RECIPE_SCHEDULED_WEBHOOK_PATH,
  verifyCronBearer,
} from "./recipeTriggerDelivery.ts";

test("verifyCronBearer rejects missing secret", () => {
  const req = new Request("https://example.com", {
    headers: { Authorization: "Bearer x" },
  });
  assert.equal(verifyCronBearer(req, undefined), false);
  assert.equal(verifyCronBearer(req, ""), false);
});

test("verifyCronBearer requires Bearer token matching secret", () => {
  const ok = new Request("https://example.com", {
    headers: { Authorization: "Bearer secret-1" },
  });
  assert.equal(verifyCronBearer(ok, "secret-1"), true);
  assert.equal(verifyCronBearer(ok, "other"), false);

  const noAuth = new Request("https://example.com");
  assert.equal(verifyCronBearer(noAuth, "secret-1"), false);

  const basic = new Request("https://example.com", {
    headers: { Authorization: "Basic x" },
  });
  assert.equal(verifyCronBearer(basic, "secret-1"), false);
});

test("buildRecipeScheduledWebhookUrl normalizes base and encodes query", () => {
  const url = buildRecipeScheduledWebhookUrl(
    "https://n8n.example.com/",
    "appt-reminder",
    "550e8400-e29b-41d4-a716-446655440000",
  );
  assert.ok(url.startsWith("https://n8n.example.com"));
  assert.ok(url.includes(RECIPE_SCHEDULED_WEBHOOK_PATH));
  assert.ok(url.includes("recipe_id=appt-reminder"));
  assert.ok(url.includes("550e8400-e29b-41d4-a716-446655440000"));
});

test("buildRecipeTriggerPostBody uses empty object for null or non-object payload", () => {
  assert.deepEqual(buildRecipeTriggerPostBody("acc-1", null), {
    account_id: "acc-1",
    trigger_data: {},
  });
  assert.deepEqual(buildRecipeTriggerPostBody("acc-1", {}), {
    account_id: "acc-1",
    trigger_data: {},
  });
});

test("buildRecipeTriggerPostBody copies object payload", () => {
  const payload = { appointment_id: "a1", offset: "T-24h" };
  const body = buildRecipeTriggerPostBody("acc-2", payload);
  assert.equal(body.account_id, "acc-2");
  assert.deepEqual(body.trigger_data, payload);
});
