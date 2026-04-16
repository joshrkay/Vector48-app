import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RecipeContext } from "../context.ts";
import {
  createEstimateFollowUpHandler,
  type EstimateFollowUpTrigger,
  type GhlPostFn,
  type GhlGetFn,
} from "./estimateFollowUp.ts";

interface CapturedAiCall {
  model: string;
  system: string;
  userMessage: string;
  max_tokens: number;
}

interface FakeCtxOptions {
  systemPrompt?: string;
  aiResponseText?: string;
}

function fakeCtx(options: FakeCtxOptions = {}) {
  const captured: { ai: CapturedAiCall | null } = { ai: null };
  const ctx = {
    accountId: "acct-1",
    agent: {
      id: "agent-1",
      account_id: "acct-1",
      recipe_slug: "estimate-follow-up",
      display_name: "Estimate Follow-Up",
      system_prompt: options.systemPrompt ?? "You write friendly follow-up SMS.",
      model: "claude-haiku-4-5",
      max_tokens: 200,
      temperature: 0.6,
      voice_id: null,
      tool_config: {},
      monthly_spend_cap_micros: 3_000_000,
      rate_limit_per_hour: 120,
      status: "active" as const,
    },
    account: {
      id: "acct-1",
      business_name: "Test HVAC",
      vertical: "hvac",
      plan_slug: "growth",
      greeting_name: null,
      notification_contact_phone: null,
    },
    ghl: {
      locationId: "loc-1",
      accessToken: "ghl-token-abc",
    },
    ai: {
      messages: {
        create: async (params: {
          model: string;
          max_tokens: number;
          system?: string;
          messages: Array<{ role: string; content: string }>;
        }) => {
          captured.ai = {
            model: params.model,
            system: params.system ?? "",
            userMessage: params.messages[0]?.content ?? "",
            max_tokens: params.max_tokens,
          };
          return {
            id: "msg_fake",
            type: "message",
            role: "assistant",
            model: params.model,
            stop_reason: "end_turn",
            stop_sequence: null,
            content: [
              {
                type: "text",
                text: options.aiResponseText ?? "Hi! Just checking in on your estimate.",
              },
            ],
            usage: {
              input_tokens: 50,
              output_tokens: 30,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
            },
          };
        },
      },
    },
    triggerId: null,
  };
  return { ctx, captured };
}

const baseTrigger: EstimateFollowUpTrigger = {
  account_id: "acct-1",
  trigger_data: {
    opportunity_id: "ghl-opp-7",
    follow_up_attempt: 1,
  },
};

function fakeGhlPost(): {
  post: GhlPostFn;
  calls: Array<{ path: string; body: unknown; opts: unknown }>;
} {
  const calls: Array<{ path: string; body: unknown; opts: unknown }> = [];
  const post: GhlPostFn = async (path, body, opts) => {
    calls.push({ path, body, opts });
    return { messageId: "ghl-msg-42" } as never;
  };
  return { post, calls };
}

function fakeGhlGet(): {
  get: GhlGetFn;
  calls: Array<{ path: string; opts: unknown }>;
} {
  const calls: Array<{ path: string; opts: unknown }> = [];
  const get: GhlGetFn = async (path, opts) => {
    calls.push({ path, opts });
    return {
      id: "ghl-opp-7",
      status: "open",
      contact: {
        id: "ghl-contact-7",
        name: "John Doe",
        firstName: "John",
        phone: "+15551234567",
      },
    } as never;
  };
  return { get, calls };
}

describe("estimateFollowUp handler", () => {
  it("sends follow-up SMS when opportunity is open", async () => {
    const { post, calls: postCalls } = fakeGhlPost();
    const { get, calls: getCalls } = fakeGhlGet();
    const handler = createEstimateFollowUpHandler({
      deps: {
        ghlPost: post,
        ghlGet: get,
        getActivationConfig: async () => ({
          followUpMessage: "Let us know if you have questions!",
          businessName: "Test HVAC",
        }),
      },
    });
    const { ctx, captured } = fakeCtx();

    const result = await handler(
      ctx as unknown as RecipeContext,
      baseTrigger,
    );

    assert.equal(result.outcome, "estimate_follow_up_sent");
    assert.ok(result.smsBody && result.smsBody.length > 0);
    assert.equal(result.messageId, "ghl-msg-42");

    assert.equal(getCalls.length, 1);
    assert.equal(postCalls.length, 1);
    assert.equal(postCalls[0].path, "/conversations/messages");
  });

  it("skips when no activation config found", async () => {
    const { get } = fakeGhlGet();
    const handler = createEstimateFollowUpHandler({
      deps: {
        ghlGet: get,
        getActivationConfig: async () => null,
      },
    });
    const { ctx } = fakeCtx();

    const result = await handler(
      ctx as unknown as RecipeContext,
      baseTrigger,
    );

    assert.equal(result.outcome, "skipped_no_activation_config");
    assert.equal(result.smsBody, null);
    assert.equal(result.messageId, null);
  });

  it("skips when opportunity not found", async () => {
    const { get } = fakeGhlGet();
    const handler = createEstimateFollowUpHandler({
      deps: {
        ghlGet: async () => null as never,
        getActivationConfig: async () => ({
          followUpMessage: "test",
        }),
      },
    });
    const { ctx } = fakeCtx();

    const result = await handler(
      ctx as unknown as RecipeContext,
      baseTrigger,
    );

    assert.equal(result.outcome, "skipped_no_opportunity");
    assert.equal(result.reason, "Opportunity not found");
  });

  it("skips when opportunity is not open", async () => {
    const { get } = fakeGhlGet();
    const brokenGet: GhlGetFn = async () => ({
      id: "ghl-opp-7",
      status: "won",
      contact: {
        id: "ghl-contact-7",
        name: "John Doe",
        firstName: "John",
        phone: "+15551234567",
      },
    } as never);
    const handler = createEstimateFollowUpHandler({
      deps: {
        ghlGet: brokenGet,
        getActivationConfig: async () => ({
          followUpMessage: "test",
        }),
      },
    });
    const { ctx } = fakeCtx();

    const result = await handler(
      ctx as unknown as RecipeContext,
      baseTrigger,
    );

    assert.equal(result.outcome, "skipped_not_open");
    assert.equal(result.reason, "Opportunity status: won");
  });

  it("uses follow_up_attempt for tone", async () => {
    const { post } = fakeGhlPost();
    const { get } = fakeGhlGet();
    const handler = createEstimateFollowUpHandler({
      deps: {
        ghlPost: post,
        ghlGet: get,
        getActivationConfig: async () => ({
          followUpMessage: "Let us know if you have questions!",
        }),
      },
    });
    const { ctx, captured } = fakeCtx();

    const triggerWithAttempt2: EstimateFollowUpTrigger = {
      account_id: "acct-1",
      trigger_data: {
        opportunity_id: "ghl-opp-7",
        follow_up_attempt: 2,
      },
    };

    const result = await handler(
      ctx as unknown as RecipeContext,
      triggerWithAttempt2,
    );

    assert.equal(result.outcome, "estimate_follow_up_sent");
    assert.ok(captured.ai);
    assert.ok(captured.ai!.userMessage.includes("slightly more direct"));
  });

  it("skips when contact has no phone", async () => {
    const { get } = fakeGhlGet();
    const noPhoneGet: GhlGetFn = async () => ({
      id: "ghl-opp-7",
      status: "open",
      contact: {
        id: "ghl-contact-7",
        name: "John Doe",
        firstName: "John",
        phone: null,
      },
    } as never);
    const handler = createEstimateFollowUpHandler({
      deps: {
        ghlGet: noPhoneGet,
        getActivationConfig: async () => ({
          followUpMessage: "test",
        }),
      },
    });
    const { ctx } = fakeCtx();

    const result = await handler(
      ctx as unknown as RecipeContext,
      baseTrigger,
    );

    assert.equal(result.outcome, "skipped_no_message");
    assert.equal(result.reason, "No phone on contact");
  });

  it("propagates errors from the Anthropic client", async () => {
    const { get } = fakeGhlGet();
    const { post } = fakeGhlPost();
    const handler = createEstimateFollowUpHandler({
      deps: {
        ghlPost: post,
        ghlGet: get,
        getActivationConfig: async () => ({
          followUpMessage: "test",
        }),
      },
    });
    const { ctx } = fakeCtx();
    ctx.ai.messages.create = async () => {
      throw new Error("spend cap exceeded");
    };

    await assert.rejects(
      () => handler(ctx as unknown as RecipeContext, baseTrigger),
      /spend cap exceeded/,
    );
  });
});