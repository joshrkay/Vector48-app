import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RecipeContext } from "../../context.ts";
import {
  createAiPhoneAnsweringHandler,
  type GhlPostFn,
  type PhoneAnsweringTrigger,
} from "./aiPhoneAnswering.ts";

// --- minimal RecipeContext fake ------------------------------------------
//
// The handler only touches:
//   ctx.agent.{system_prompt, model, max_tokens, temperature, tool_config}
//   ctx.account.business_name
//   ctx.ghl.{locationId, accessToken}
//   ctx.ai.messages.create
//
// Everything else is declared on RecipeContext for other consumers, so we
// build a partial object and cast through `unknown` at the call site
// rather than constructing a full row. No `any` — the project's eslint
// config rejects it.

interface CapturedAiCall {
  model: string;
  system: string;
  userMessage: string;
  max_tokens: number;
}

interface FakeCtxOptions {
  systemPrompt?: string;
  toolConfig?: Record<string, unknown>;
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
      recipe_slug: "ai-phone-answering",
      display_name: "Test Receptionist",
      system_prompt:
        options.systemPrompt ??
        "You summarize calls for Test HVAC, a plumbing company.",
      model: "claude-haiku-4-5",
      max_tokens: 300,
      temperature: 0.3,
      voice_id: null,
      tool_config: options.toolConfig ?? {
        notification_contact_id: "ghl-contact-owner",
      },
      monthly_spend_cap_micros: null,
      rate_limit_per_hour: null,
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
                  "Homeowner Janet Smith called about a leaking kitchen faucet. Urgency: medium. She asked for a callback Tuesday morning. No pricing given.",
              },
            ],
            usage: {
              input_tokens: 150,
              output_tokens: 80,
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

// Fake GhlPost that records calls and returns a synthetic message id.
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

const baseTrigger: PhoneAnsweringTrigger = {
  call: {
    type: "CallCompleted",
    locationId: "loc-1",
    contactId: "ghl-caller-7",
    contact: { firstName: "Janet", lastName: "Smith", name: "Janet Smith" },
    callDuration: 124,
    direction: "inbound",
    transcription:
      "Hi this is Janet Smith calling about a leak under the sink. Can someone come take a look tomorrow morning?",
  },
};

describe("aiPhoneAnswering handler", () => {
  it("summarizes the transcript and sends an SMS to the notification contact", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createAiPhoneAnsweringHandler({ deps: { ghlPost: post } });
    const { ctx, captured } = fakeCtx();

    const result = await handler(ctx as unknown as RecipeContext, baseTrigger);

    assert.equal(result.outcome, "summary_sent");
    assert.equal(result.smsMessageId, "ghl-msg-42");
    assert.ok(result.summary && result.summary.length > 0);

    // Claude call receives the tenant's prompt + the caller metadata.
    assert.ok(captured.ai);
    assert.equal(captured.ai!.model, "claude-haiku-4-5");
    assert.equal(captured.ai!.max_tokens, 300);
    assert.match(captured.ai!.system, /Test HVAC/);
    assert.match(captured.ai!.userMessage, /Janet/);
    assert.match(captured.ai!.userMessage, /leak under the sink/);
    assert.match(captured.ai!.userMessage, /Call duration: 124s/);

    // GHL send uses the runner-provided credentials and the operator-
    // configured notification contact, NOT the caller.
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
    assert.equal(body.contactId, "ghl-contact-owner");
    assert.match(body.message, /Test HVAC/);
    assert.match(body.message, /Janet Smith/);
  });

  it("skips when the webhook has no transcript", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createAiPhoneAnsweringHandler({ deps: { ghlPost: post } });
    const { ctx, captured } = fakeCtx();

    const trigger: PhoneAnsweringTrigger = {
      call: {
        type: "CallCompleted",
        locationId: "loc-1",
        contactId: "ghl-caller-7",
        transcription: "",
        summary: undefined,
      },
    };

    const result = await handler(ctx as unknown as RecipeContext, trigger);

    assert.equal(result.outcome, "skipped_no_transcript");
    assert.equal(result.summary, null);
    assert.equal(result.smsMessageId, null);
    assert.equal(captured.ai, null, "Claude should not be called");
    assert.equal(calls.length, 0, "GHL should not be called");
  });

  it("falls back to `summary` field when `transcription` is missing", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createAiPhoneAnsweringHandler({ deps: { ghlPost: post } });
    const { ctx } = fakeCtx();

    const trigger: PhoneAnsweringTrigger = {
      call: {
        type: "CallCompleted",
        locationId: "loc-1",
        contactId: "ghl-caller-7",
        summary: "Customer booked a tune-up for Friday.",
      },
    };

    const result = await handler(ctx as unknown as RecipeContext, trigger);

    assert.equal(result.outcome, "summary_sent");
    assert.equal(calls.length, 1);
  });

  it("skips SMS when the tenant has not configured a notification contact", async () => {
    const { post, calls } = fakeGhlPost();
    const handler = createAiPhoneAnsweringHandler({ deps: { ghlPost: post } });
    // No notification_contact_id in tool_config
    const { ctx } = fakeCtx({ toolConfig: {} });

    const result = await handler(ctx as unknown as RecipeContext, baseTrigger);

    assert.equal(result.outcome, "skipped_no_notification_contact");
    assert.ok(result.summary, "summary is still generated for logging");
    assert.equal(result.smsMessageId, null);
    assert.equal(calls.length, 0, "GHL send is skipped");
  });

  it("propagates errors from the Anthropic client", async () => {
    const { post } = fakeGhlPost();
    const handler = createAiPhoneAnsweringHandler({ deps: { ghlPost: post } });
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
