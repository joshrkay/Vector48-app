import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RecipeContext } from "../context.ts";
import {
  createMissedCallTextBackHandler,
  type GhlPostFn,
  type MissedCallTextBackTrigger,
} from "./missedCallTextBack.ts";

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
      recipe_slug: "missed-call-text-back",
      display_name: "Missed Call Auto-Responder",
      system_prompt:
        options.systemPrompt ??
        "You write friendly, professional SMS text-back messages for Test HVAC, a plumbing company.",
      model: "claude-haiku-4-5",
      max_tokens: 150,
      temperature: 0.5,
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
                  "Hi! Sorry we missed your call. We'll call you back shortly.",
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

const baseTrigger: MissedCallTextBackTrigger = {
  account_id: "acct-1",
  contact_id: "ghl-caller-7",
  call_id: "call-123",
  call_status: "missed",
  owner_contact_id: "ghl-owner-7",
};

describe("missedCallTextBack handler", () => {
  it("sends SMS to caller and owner when both configured", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createMissedCallTextBackHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => ({
          ownerContactId: "ghl-owner-7",
        }),
        getCallerContact: async () => ({
          name: "John Doe",
          firstName: "John",
        }),
      },
    });
    const { ctx, captured } = fakeCtx();

    const result = await handler(
      ctx as unknown as RecipeContext,
      baseTrigger,
    );

    assert.equal(result.outcome, "text_back_sent");
    assert.ok(result.smsBody && result.smsBody.length > 0);
    assert.equal(result.callerMessageId, "ghl-msg-42");
    assert.equal(result.ownerMessageId, "ghl-msg-42");

    assert.ok(captured.ai);
    assert.equal(captured.ai!.model, "claude-haiku-4-5");
    assert.equal(captured.ai!.max_tokens, 150);

    assert.equal(calls.length, 2);
    const callerCall = calls[0];
    const ownerCall = calls[1];

    assert.equal(callerCall.path, "/conversations/messages");
    const callerBody = callerCall.body as { contactId: string; type: string };
    assert.equal(callerBody.contactId, "ghl-caller-7");
    assert.equal(callerBody.type, "SMS");

    assert.equal(ownerCall.path, "/conversations/messages");
    const ownerBody = ownerCall.body as { contactId: string; type: string };
    assert.equal(ownerBody.contactId, "ghl-owner-7");
    assert.equal(ownerBody.type, "SMS");
  });

  it("skips when no activation config found", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createMissedCallTextBackHandler({
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
    assert.equal(result.callerMessageId, null);
    assert.equal(result.ownerMessageId, null);
    assert.equal(captured.ai, null, "Claude should not be called");
    assert.equal(calls.length, 0, "GHL should not be called");
  });

  it("skips caller SMS but sends owner SMS when caller contact not found", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createMissedCallTextBackHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => ({
          ownerContactId: "ghl-owner-7",
        }),
        getCallerContact: async () => null,
      },
    });
    const { ctx } = fakeCtx();

    ctx.ai.messages.create = async () => {
      throw new Error("should not be called");
    };

    const triggerWithoutContact: MissedCallTextBackTrigger = {
      account_id: "acct-1",
      contact_id: "nonexistent-contact",
      call_status: "missed",
    };

    const result = await handler(
      ctx as unknown as RecipeContext,
      triggerWithoutContact,
    );

    assert.equal(result.outcome, "skipped_no_caller_contact");
    assert.equal(result.callerMessageId, null);
    assert.equal(result.ownerMessageId, "ghl-msg-42");
  });

  it("skips owner SMS when no owner configured", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createMissedCallTextBackHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => ({}),
        getCallerContact: async () => ({
          name: "Jane Doe",
          firstName: "Jane",
        }),
      },
    });
    const { ctx } = fakeCtx();

    const trigger: MissedCallTextBackTrigger = {
      account_id: "acct-1",
      contact_id: "ghl-caller-7",
      call_status: "missed",
    };

    const result = await handler(
      ctx as unknown as RecipeContext,
      trigger,
    );

    assert.equal(result.outcome, "text_back_sent");
    assert.equal(result.callerMessageId, "ghl-msg-42");
    assert.equal(result.ownerMessageId, null);

    assert.equal(calls.length, 1);
    const callerCall = calls[0];
    const callerBody = callerCall.body as { contactId: string };
    assert.equal(callerBody.contactId, "ghl-caller-7");
  });

  it("uses webhook owner_contact_id over activation config", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createMissedCallTextBackHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => ({
          ownerContactId: "config-owner",
        }),
        getCallerContact: async () => ({
          name: "Test Caller",
          firstName: "Test",
        }),
      },
    });
    const { ctx } = fakeCtx();

    const trigger: MissedCallTextBackTrigger = {
      account_id: "acct-1",
      contact_id: "ghl-caller-7",
      call_status: "missed",
      owner_contact_id: "webhook-owner",
    };

    const result = await handler(
      ctx as unknown as RecipeContext,
      trigger,
    );

    assert.equal(result.outcome, "text_back_sent");

    const ownerCall = calls.find(
      (c) =>
        (c.body as { contactId: string }).contactId === "webhook-owner",
    );
    assert.ok(ownerCall, "Should use webhook owner_contact_id");
  });

  it("propagates errors from the Anthropic client", async () => {
    const { post } = fakeGhlPost();
    const handler = createMissedCallTextBackHandler({
      deps: {
        ghlPost: post,
        getActivationConfig: async () => ({
          ownerContactId: "ghl-owner-7",
        }),
        getCallerContact: async () => ({
          name: "Test Caller",
          firstName: "Test",
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