import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RecipeContext } from "../context.ts";
import {
  createMissedCallTextBackHandler,
  type GhlPostFn,
  type MissedCallTrigger,
} from "./missedCallTextBack.ts";

// Minimal RecipeContext fake — same pattern as aiPhoneAnswering.test.ts.
// Cast through `unknown` at the call site since we only populate the
// fields the handler touches.

interface CapturedAiCall {
  model: string;
  system: string;
  userMessage: string;
  max_tokens: number;
}

interface FakeCtxOptions {
  aiResponseText?: string;
  toolConfig?: Record<string, unknown>;
}

function fakeCtx(options: FakeCtxOptions = {}) {
  const captured: { ai: CapturedAiCall | null } = { ai: null };
  const ctx = {
    accountId: "acct-1",
    agent: {
      id: "agent-missed-1",
      account_id: "acct-1",
      recipe_slug: "missed-call-text-back",
      display_name: "Test Text-Back",
      system_prompt:
        "You write friendly text-back SMS messages for Test HVAC, a plumbing company. Under 160 characters, no emojis.",
      model: "claude-haiku-4-5",
      max_tokens: 150,
      temperature: 0.5,
      voice_id: null,
      tool_config: options.toolConfig ?? {},
      monthly_spend_cap_micros: null,
      rate_limit_per_hour: null,
      status: "active" as const,
    },
    account: {
      id: "acct-1",
      business_name: "Test HVAC",
      vertical: "plumbing",
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
            id: "msg_fake_missed",
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
                  "Hi — thanks for calling Test HVAC. We missed your call and will ring you back shortly. — Test HVAC team",
              },
            ],
            usage: {
              input_tokens: 80,
              output_tokens: 32,
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
    return { messageId: "ghl-msg-missed-99" } as never;
  };
  return { post, calls };
}

const happyTrigger: MissedCallTrigger = {
  type: "CallCompleted",
  locationId: "loc-1",
  contactId: "ghl-caller-missed-1",
  contact: {
    id: "ghl-caller-missed-1",
    firstName: "Alex",
    lastName: "Johnson",
    phone: "+15551234567",
  },
  from: "+15551234567",
  direction: "inbound",
  callDuration: 0,
};

describe("missedCallTextBack handler", () => {
  it("generates an SMS and sends it to the caller's contactId", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createMissedCallTextBackHandler({ deps: { ghlPost: post } });
    const { ctx, captured } = fakeCtx();

    const result = await handler(
      ctx as unknown as RecipeContext,
      happyTrigger,
    );

    assert.equal(result.outcome, "sms_sent");
    assert.equal(result.smsMessageId, "ghl-msg-missed-99");
    assert.match(result.summary ?? "", /SMS sent to ghl-caller-missed-1/);

    // Claude call received the tenant's prompt + caller metadata.
    assert.ok(captured.ai);
    assert.equal(captured.ai!.model, "claude-haiku-4-5");
    assert.equal(captured.ai!.max_tokens, 150);
    assert.match(captured.ai!.system, /Test HVAC/);
    assert.match(captured.ai!.userMessage, /Alex/);
    assert.match(captured.ai!.userMessage, /\+15551234567/);

    // GHL send is to the CALLER, not an owner contact.
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, "/conversations/messages");
    assert.deepEqual(calls[0].opts, {
      locationId: "loc-1",
      apiKey: "ghl-token-abc",
    });
    const body = calls[0].body as {
      type: string;
      contactId: string;
      message: string;
    };
    assert.equal(body.type, "SMS");
    assert.equal(body.contactId, "ghl-caller-missed-1");
    assert.ok(body.message.length > 0);
    assert.ok(body.message.length <= 300, "SMS body should be short");

    // RecipeResult.automationDetail carries everything the feed needs.
    assert.equal(
      (result.automationDetail as Record<string, unknown>).caller_contact_id,
      "ghl-caller-missed-1",
    );
    assert.equal(
      (result.automationDetail as Record<string, unknown>).sms_message_id,
      "ghl-msg-missed-99",
    );
    assert.equal(
      (result.automationDetail as Record<string, unknown>).caller_phone,
      "+15551234567",
    );
  });

  it("reads the contact id from contact_id snake_case fallback", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createMissedCallTextBackHandler({ deps: { ghlPost: post } });
    const { ctx } = fakeCtx();

    const trigger: MissedCallTrigger = {
      type: "CallCompleted",
      locationId: "loc-1",
      contact_id: "ghl-caller-snake",
      from: "+15559998888",
    };

    const result = await handler(ctx as unknown as RecipeContext, trigger);
    assert.equal(result.outcome, "sms_sent");
    assert.equal(
      (calls[0].body as { contactId: string }).contactId,
      "ghl-caller-snake",
    );
  });

  it("skips when no caller contact id is present (claude + ghl never called)", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createMissedCallTextBackHandler({ deps: { ghlPost: post } });
    const { ctx, captured } = fakeCtx();

    const trigger: MissedCallTrigger = {
      type: "CallCompleted",
      locationId: "loc-1",
      from: "+15551112222",
    };

    const result = await handler(ctx as unknown as RecipeContext, trigger);

    assert.equal(result.outcome, "skipped_no_caller_contact");
    assert.equal(result.smsMessageId, null);
    assert.match(result.summary ?? "", /no caller contact id/);
    assert.equal(captured.ai, null, "Claude should not be called");
    assert.equal(calls.length, 0, "GHL should not be called");
    assert.equal(
      (result.automationDetail as Record<string, unknown>).caller_phone,
      "+15551112222",
    );
  });

  it("skips when Claude returns empty text", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createMissedCallTextBackHandler({ deps: { ghlPost: post } });
    const { ctx } = fakeCtx({ aiResponseText: "   " });

    const result = await handler(
      ctx as unknown as RecipeContext,
      happyTrigger,
    );

    assert.equal(result.outcome, "skipped_empty_llm_response");
    assert.equal(result.smsMessageId, null);
    assert.equal(calls.length, 0, "GHL should not be called");
  });

  it("propagates errors from the Anthropic client", async () => {
    const { post } = fakeGhlPost();
    const handler = createMissedCallTextBackHandler({ deps: { ghlPost: post } });
    const { ctx } = fakeCtx();
    ctx.ai.messages.create = async () => {
      throw new Error("spend cap exceeded");
    };

    await assert.rejects(
      () => handler(ctx as unknown as RecipeContext, happyTrigger),
      /spend cap exceeded/,
    );
  });
});
