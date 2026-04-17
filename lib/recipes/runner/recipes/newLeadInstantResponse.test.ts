import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RecipeContext } from "../context.ts";
import {
  createNewLeadInstantResponseHandler,
  type NewLeadInstantResponseTrigger,
  type GhlPostFn,
} from "./newLeadInstantResponse.ts";

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
      recipe_slug: "new-lead-instant-response",
      display_name: "New Lead Instant Response",
      system_prompt:
        options.systemPrompt ??
        "You write friendly welcome SMS for Test HVAC.",
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
                text: options.aiResponseText ?? "Hey John! Thanks for reaching out to Test HVAC. How can we help?",
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

const baseTrigger: NewLeadInstantResponseTrigger = {
  account_id: "acct-1",
  trigger_data: {
    contact_id: "ghl-contact-7",
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

describe("newLeadInstantResponse handler", () => {
  it("sends instant response SMS to new lead", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createNewLeadInstantResponseHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => ({
          responseMessage: "Thanks for reaching out!",
          businessName: "Test HVAC",
        }),
        getCallerContact: async () => ({
          name: "John Doe",
          firstName: "John",
          phone: "+15551234567",
        }),
      },
    });
    const { ctx } = fakeCtx();

    const result = await handler(
      ctx as unknown as RecipeContext,
      baseTrigger,
    );

    assert.equal(result.outcome, "response_sent");
    assert.ok(result.smsBody && result.smsBody.length > 0);
    assert.equal(result.messageId, "ghl-msg-42");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, "/conversations/messages");
  });

  it("skips when no activation config found", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createNewLeadInstantResponseHandler({
      deps: {
        ghlPost: post,
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
    assert.equal(calls.length, 0);
  });

  it("skips when contact not found", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createNewLeadInstantResponseHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => ({ responseMessage: "test" }),
        getCallerContact: async () => null,
      },
    });
    const { ctx } = fakeCtx();

    const result = await handler(
      ctx as unknown as RecipeContext,
      baseTrigger,
    );

    assert.equal(result.outcome, "skipped_no_contact");
    assert.equal(calls.length, 0);
  });

  it("uses custom response message from config", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createNewLeadInstantResponseHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => ({
          responseMessage: "Custom intro message here",
        }),
        getCallerContact: async () => ({
          name: "Jane Doe",
          firstName: "Jane",
          phone: "+15559876543",
        }),
      },
    });
    const { ctx, captured } = fakeCtx();

    const result = await handler(
      ctx as unknown as RecipeContext,
      baseTrigger,
    );

    assert.equal(result.outcome, "response_sent");
    assert.ok(captured.ai);
    assert.ok(captured.ai!.userMessage.includes("Custom intro message here"));
  });

  it("skips when contact has no phone", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createNewLeadInstantResponseHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => ({ responseMessage: "test" }),
        getCallerContact: async () => ({
          name: "John Doe",
          firstName: "John",
          phone: undefined,
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

  it("includes business name in message", async () => {
    const { post } = fakeGhlPost();
    const handler = createNewLeadInstantResponseHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => ({
          responseMessage: "Thanks!",
          businessName: "Acme Plumbing",
        }),
        getCallerContact: async () => ({
          name: "John Doe",
          firstName: "John",
          phone: "+15551234567",
        }),
      },
    });
    const { ctx } = fakeCtx();

    const result = await handler(
      ctx as unknown as RecipeContext,
      baseTrigger,
    );

    assert.equal(result.outcome, "response_sent");
  });

  it("propagates errors from the Anthropic client", async () => {
    const { post } = fakeGhlPost();
    const handler = createNewLeadInstantResponseHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => ({ responseMessage: "test" }),
        getCallerContact: async () => ({
          name: "John Doe",
          firstName: "John",
          phone: "+15551234567",
        }),
      },
    });
    const { ctx } = fakeCtx();
    ctx.ai.messages.create = async () => {
      throw new Error("API error");
    };

    await assert.rejects(
      () => handler(ctx as unknown as RecipeContext, baseTrigger),
      /API error/,
    );
  });
});