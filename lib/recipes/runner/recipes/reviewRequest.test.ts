import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RecipeContext } from "../context.ts";
import {
  createReviewRequestHandler,
  type GhlPostFn,
  type ReviewRequestTrigger,
} from "./reviewRequest.ts";

interface CapturedAiCall {
  model: string;
  system: string;
  userMessage: string;
  max_tokens: number;
}

interface FakeCtxOptions {
  systemPrompt?: string;
  businessName?: string;
  aiResponseText?: string;
}

function fakeCtx(options: FakeCtxOptions = {}) {
  const captured: { ai: CapturedAiCall | null } = { ai: null };
  const ctx = {
    accountId: "acct-1",
    agent: {
      id: "agent-1",
      account_id: "acct-1",
      recipe_slug: "review-request",
      display_name: "Review Request Sender",
      system_prompt:
        options.systemPrompt ??
        "You write friendly review-request SMS messages for Test HVAC, a plumbing company.",
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
      business_name: options.businessName ?? "Test HVAC",
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
                text:
                  options.aiResponseText ??
                  `Thanks for choosing us! ${REVIEW_LINK_PLACEHOLDER} would really help us out.`,
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

const REVIEW_LINK_PLACEHOLDER = "[REVIEW_LINK]";

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

const baseTrigger: ReviewRequestTrigger = {
  account_id: "acct-1",
  trigger_data: {
    contact_id: "ghl-caller-7",
    review_link: "https://g.page/test-hvac/review",
  },
};

describe("reviewRequest handler", () => {
  it("sends review request SMS with link", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createReviewRequestHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => ({
          reviewLink: "https://g.page/test-hvac/review",
        }),
        getCallerContact: async () => ({
          name: "John Doe",
          firstName: "John",
          phone: "ghl-contact-7",
        }),
      },
    });
    const { ctx, captured } = fakeCtx();

    const result = await handler(
      ctx as unknown as RecipeContext,
      baseTrigger,
    );

    assert.equal(result.outcome, "review_request_sent");
    assert.ok(result.smsBody && result.smsBody.length > 0);
    assert.ok(result.smsBody?.includes("https://g.page/test-hvac/review"));
    assert.equal(result.messageId, "ghl-msg-42");

    assert.ok(captured.ai);
    assert.equal(captured.ai!.model, "claude-haiku-4-5");
    assert.equal(captured.ai!.max_tokens, 200);

    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.equal(call.path, "/conversations/messages");
    const body = call.body as { contactId: string; type: string; message: string };
    assert.equal(body.contactId, "ghl-caller-7");
    assert.equal(body.type, "SMS");
  });

  it("skips when no activation config found", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createReviewRequestHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => null,
      },
    });
    const { ctx, captured } = fakeCtx();

    const result = await handler(
      ctx as unknown as RecipeContext,
      baseTrigger,
    );

    assert.equal(result.outcome, "skipped_no_activation_config");
    assert.equal(result.smsBody, null);
    assert.equal(result.messageId, null);
    assert.equal(captured.ai, null, "Claude should not be called");
    assert.equal(calls.length, 0, "GHL should not be called");
  });

  it("skips when no review link (config + trigger)", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createReviewRequestHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => ({}),
      },
    });
    const { ctx, captured } = fakeCtx();

    const triggerNoLink: ReviewRequestTrigger = {
      account_id: "acct-1",
      trigger_data: {
        contact_id: "ghl-caller-7",
      },
    };

    const result = await handler(
      ctx as unknown as RecipeContext,
      triggerNoLink,
    );

    assert.equal(result.outcome, "skipped_no_review_link");
    assert.equal(captured.ai, null, "Claude should not be called");
  });

  it("uses trigger review_link as fallback when config missing", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createReviewRequestHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => ({}),
        getCallerContact: async () => ({
          name: "Jane Doe",
          firstName: "Jane",
          phone: "ghl-contact-7",
        }),
      },
    });
    const { ctx, captured } = fakeCtx();

    const result = await handler(
      ctx as unknown as RecipeContext,
      baseTrigger,
    );

    assert.equal(result.outcome, "review_request_sent");
    assert.ok(result.smsBody?.includes("https://g.page/test-hvac/review"));
  });

  it("skips when contact not found", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createReviewRequestHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => ({
          reviewLink: "https://g.page/test-hvac/review",
        }),
        getCallerContact: async () => null,
      },
    });
    const { ctx } = fakeCtx();

    const result = await handler(
      ctx as unknown as RecipeContext,
      baseTrigger,
    );

    assert.equal(result.outcome, "skipped_no_contact");
    assert.equal(calls.length, 0, "GHL should not be called");
  });

  it("truncates message when >300 chars", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createReviewRequestHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => ({
          reviewLink: "https://g.page/test-hvac/review",
        }),
        getCallerContact: async () => ({
          name: "John Doe",
          firstName: "John",
          phone: "ghl-contact-7",
        }),
      },
    });
    const { ctx } = fakeCtx({
      aiResponseText:
        `Thank you so much for choosing us for your plumbing needs! ` +
        `We really appreciate your business and would love if you could take ` +
        `a moment to leave us a review at ${REVIEW_LINK_PLACEHOLDER}. ` +
        `Your feedback helps us improve and helps other homeowners find ` +
        `reliable service. Thank you again for trusting us!`,
    });

    const result = await handler(
      ctx as unknown as RecipeContext,
      baseTrigger,
    );

    assert.equal(result.outcome, "review_request_sent");
    assert.ok(result.smsBody, "Should have SMS body");
    assert.ok(result.smsBody!.length <= 300, "Should be truncated to 300");
    assert.ok(result.smsBody!.includes("https://g.page/test-hvac/review"), "Should include link");
  });

  it("replaces [REVIEW_LINK] token even if LLM omits it", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createReviewRequestHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => ({
          reviewLink: "https://g.page/test-hvac/review",
        }),
        getCallerContact: async () => ({
          name: "John Doe",
          firstName: "John",
          phone: "ghl-contact-7",
        }),
      },
    });
    const { ctx } = fakeCtx({
      aiResponseText: "Thanks for choosing us! Please leave a review.",
    });

    const result = await handler(
      ctx as unknown as RecipeContext,
      baseTrigger,
    );

    assert.equal(result.outcome, "review_request_sent");
    assert.ok(result.smsBody?.includes("https://g.page/test-hvac/review"));
  });

  it("propagates errors from the Anthropic client", async () => {
    const { post } = fakeGhlPost();
    const handler = createReviewRequestHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => ({
          reviewLink: "https://g.page/test-hvac/review",
        }),
        getCallerContact: async () => ({
          name: "John Doe",
          firstName: "John",
          phone: "ghl-contact-7",
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