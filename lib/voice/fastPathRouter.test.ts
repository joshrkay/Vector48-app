import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { routeVoiceIntentFastPath } from "./fastPathRouter.ts";

describe("routeVoiceIntentFastPath", () => {
  it("routes unread inbox navigation", () => {
    const action = routeVoiceIntentFastPath({
      transcript: "Show unread messages",
      activeRecipeSlugs: [],
      summary: null,
    });

    assert.ok(action);
    assert.equal(action?.type, "navigate");
    if (action?.type === "navigate") {
      assert.equal(action.route, "/crm/inbox");
      assert.equal(action.params?.filter, "unread");
    }
  });

  it("routes recipe activation actions with confirmation", () => {
    const action = routeVoiceIntentFastPath({
      transcript: "Activate estimate follow up recipe",
      activeRecipeSlugs: [],
      summary: null,
    });

    assert.ok(action);
    assert.equal(action?.type, "action");
    if (action?.type === "action") {
      assert.equal(action.action, "recipe.activate");
      assert.equal(action.requiresConfirmation, true);
      assert.equal(action.params.recipeSlug, "estimate-follow-up");
    }
  });

  it("answers status using live summary when available", () => {
    const action = routeVoiceIntentFastPath({
      transcript: "How many calls today?",
      activeRecipeSlugs: [],
      summary: {
        openLeads: 3,
        conversationsToday: 8,
        totalContacts: 88,
        unreadInbox: 4,
      },
    });

    assert.ok(action);
    assert.equal(action?.type, "answer");
    if (action?.type === "answer") {
      assert.match(action.message, /8/);
    }
  });

  it("returns null for unrelated intent", () => {
    const action = routeVoiceIntentFastPath({
      transcript: "Tell me a joke",
      activeRecipeSlugs: [],
      summary: null,
    });

    assert.equal(action, null);
  });
});
