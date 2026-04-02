import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseVoiceActionPayload } from "./types.ts";

describe("parseVoiceActionPayload", () => {
  it("accepts navigate actions", () => {
    const action = parseVoiceActionPayload({
      type: "navigate",
      route: "/crm/inbox",
      params: { filter: "unread" },
      message: "Opening unread inbox.",
    });

    assert.equal(action.type, "navigate");
    if (action.type === "navigate") {
      assert.equal(action.route, "/crm/inbox");
    }
  });

  it("rejects action operations outside allowlist", () => {
    assert.throws(() =>
      parseVoiceActionPayload({
        type: "action",
        action: "crm.delete_everything",
        params: {},
        message: "Nope",
        requiresConfirmation: true,
      }),
    );
  });

  it("requires required params for operation", () => {
    assert.throws(() =>
      parseVoiceActionPayload({
        type: "action",
        action: "recipe.activate",
        params: {},
        message: "Activate",
        requiresConfirmation: true,
      }),
    );
  });
});
