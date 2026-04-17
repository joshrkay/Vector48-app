import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RecipeContext } from "../context.ts";
import {
  createPostJobUpsellHandler,
  type PostJobUpsellTrigger,
  type GhlPostFn,
} from "./postJobUpsell.ts";

function fakeCtx(options: { aiResponseText?: string } = {}) {
  const ctx = {
    accountId: "acct-1",
    agent: {
      id: "agent-1", account_id: "acct-1", recipe_slug: "post-job-upsell", display_name: "Post-Job Upsell",
      system_prompt: "You write friendly upsell SMS.", model: "claude-haiku-4-5",
      max_tokens: 200, temperature: 0.6, voice_id: null, tool_config: {},
      monthly_spend_cap_micros: 3_000_000, rate_limit_per_hour: 120, status: "active" as const,
    },
    account: { id: "acct-1", business_name: "Test HVAC", vertical: "hvac", plan_slug: "growth", greeting_name: null, notification_contact_phone: null },
    ghl: { locationId: "loc-1", accessToken: "ghl-token-abc" },
    ai: {
      messages: {
        create: async (params: { model: string; max_tokens: number; system?: string; messages: Array<{ role: string; content: string }> }) => {
          return {
            id: "msg_fake", type: "message", role: "assistant", model: params.model,
            stop_reason: "end_turn", stop_sequence: null,
            content: [{ type: "text", text: options.aiResponseText ?? "Hey John! Have you considered..." }],
            usage: { input_tokens: 50, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          };
        },
      },
    },
    triggerId: null,
  };
  return ctx;
}

const baseTrigger: PostJobUpsellTrigger = {
  account_id: "acct-1",
  trigger_data: { contact_id: "ghl-contact-7", job_type: "HVAC repair" },
};

function fakeGhlPost() {
  const calls: Array<{ path: string; body: unknown; opts: unknown }> = [];
  const post: GhlPostFn = async (path, body, opts) => {
    calls.push({ path, body, opts });
    return { messageId: "ghl-msg-42" } as never;
  };
  return { post, calls };
}

describe("postJobUpsell handler", () => {
  it("sends upsell SMS", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createPostJobUpsellHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => ({ upsellMessage: "Consider a maintenance plan!", businessName: "Test HVAC" }),
        getCallerContact: async () => ({ name: "John Doe", firstName: "John", phone: "+15551234567" }),
      },
    });
    const ctx = fakeCtx();
    const result = await handler(ctx as unknown as RecipeContext, baseTrigger);
    assert.equal(result.outcome, "upsell_sent");
    assert.ok(result.smsBody);
    assert.equal(calls.length, 1);
  });

  it("skips when no activation config", async () => {
    const { post } = fakeGhlPost();
    const handler = createPostJobUpsellHandler({ deps: { ghlPost: post, getActivationConfig: async () => null } });
    const ctx = fakeCtx();
    const result = await handler(ctx as unknown as RecipeContext, baseTrigger);
    assert.equal(result.outcome, "skipped_no_activation_config");
  });

  it("skips when contact not found", async () => {
    const { post } = fakeGhlPost();
    const handler = createPostJobUpsellHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => ({}),
        getCallerContact: async () => null,
      },
    });
    const ctx = fakeCtx();
    const result = await handler(ctx as unknown as RecipeContext, baseTrigger);
    assert.equal(result.outcome, "skipped_no_contact");
  });

  it("skips when no phone", async () => {
    const { post } = fakeGhlPost();
    const handler = createPostJobUpsellHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => ({}),
        getCallerContact: async () => ({ name: "John Doe", firstName: "John", phone: undefined }),
      },
    });
    const ctx = fakeCtx();
    const result = await handler(ctx as unknown as RecipeContext, baseTrigger);
    assert.equal(result.outcome, "skipped_no_message");
  });
});