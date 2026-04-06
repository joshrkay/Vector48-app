import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { executeVoiceAction } from "./actionExecutor.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("executeVoiceAction", () => {
  it("pushes routes for navigate actions", async () => {
    let pushed = "";
    await executeVoiceAction(
      {
        type: "navigate",
        route: "/crm/inbox",
        params: { filter: "unread" },
        message: "Opening unread inbox.",
      },
      {
        router: {
          push: (href: string) => {
            pushed = href;
          },
        },
        requestConfirmation: async () => false,
        showToast: () => undefined,
      },
    );

    assert.equal(pushed, "/crm/inbox?filter=unread");
  });

  it("executes confirmed mutation actions against mapped endpoint", async () => {
    let requestedUrl = "";
    let requestedMethod = "";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedMethod = init?.method ?? "GET";
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as typeof fetch;

    await executeVoiceAction(
      {
        type: "action",
        action: "recipe.activate",
        params: { recipeSlug: "estimate-follow-up" },
        message: "Activate estimate follow-up.",
        requiresConfirmation: true,
      },
      {
        router: { push: () => undefined },
        requestConfirmation: async () => true,
        showToast: () => undefined,
      },
    );

    assert.equal(requestedUrl, "/api/recipes/activate");
    assert.equal(requestedMethod, "POST");
  });
});
