import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RecipeContext } from "../context.ts";
import {
  createAppointmentReminderHandler,
  type AppointmentReminderTrigger,
  type GhlPostFn,
  type GhlGetFn,
} from "./appointmentReminder.ts";

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
      recipe_slug: "appointment-reminder",
      display_name: "Appointment Reminder",
      system_prompt: options.systemPrompt ?? "You write friendly reminder SMS.",
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
                text: options.aiResponseText ?? "Hi John! Just a reminder about your appointment tomorrow.",
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

const baseTrigger: AppointmentReminderTrigger = {
  account_id: "acct-1",
  trigger_data: {
    appointment_id: "ghl-appt-7",
    reminder_type: "24h",
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
      id: "ghl-appt-7",
      status: "cheduled",
      startTime: "2026-04-17T10:00:00Z",
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

describe("appointmentReminder handler", () => {
  it("sends reminder SMS for scheduled appointment", async () => {
    const { post } = fakeGhlPost();
    const { get } = fakeGhlGet();
    const handler = createAppointmentReminderHandler({
      deps: {
        ghlPost: post,
        ghlGet: get,
        getActivationConfig: async () => ({
          reminder24h: "Your appointment is tomorrow!",
          businessName: "Test HVAC",
        }),
      },
    });
    const { ctx } = fakeCtx();

    const result = await handler(
      ctx as unknown as RecipeContext,
      baseTrigger,
    );

    assert.equal(result.outcome, "reminder_sent");
    assert.ok(result.smsBody && result.smsBody.length > 0);
    assert.equal(result.messageId, "ghl-msg-42");
  });

  it("skips when no activation config found", async () => {
    const { get } = fakeGhlGet();
    const handler = createAppointmentReminderHandler({
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

  it("skips when appointment not found", async () => {
    const { get } = fakeGhlGet();
    const notFoundGet: GhlGetFn = async () => null as never;
    const handler = createAppointmentReminderHandler({
      deps: {
        ghlGet: notFoundGet,
        getActivationConfig: async () => ({ reminder24h: "test" }),
      },
    });
    const { ctx } = fakeCtx();

    const result = await handler(
      ctx as unknown as RecipeContext,
      baseTrigger,
    );

    assert.equal(result.outcome, "skipped_no_appointment");
    assert.equal(result.reason, "Appointment not found");
  });

  it("skips when appointment is cancelled", async () => {
    const { get } = fakeGhlGet();
    const cancelledGet: GhlGetFn = async () => ({
      id: "ghl-appt-7",
      status: "cancelled",
      startTime: "2026-04-17T10:00:00Z",
      contact: {
        id: "ghl-contact-7",
        name: "John Doe",
        firstName: "John",
        phone: "+15551234567",
      },
    } as never);
    const handler = createAppointmentReminderHandler({
      deps: {
        ghlGet: cancelledGet,
        getActivationConfig: async () => ({ reminder24h: "test" }),
      },
    });
    const { ctx } = fakeCtx();

    const result = await handler(
      ctx as unknown as RecipeContext,
      baseTrigger,
    );

    assert.equal(result.outcome, "skipped_cancelled");
    assert.equal(result.reason, "Appointment is cancelled");
  });

  it("uses 24h template for 24h reminder", async () => {
    const { post } = fakeGhlPost();
    const { get } = fakeGhlGet();
    const handler = createAppointmentReminderHandler({
      deps: {
        ghlPost: post,
        ghlGet: get,
        getActivationConfig: async () => ({
          reminder24h: "See you tomorrow!",
          reminder2h: "See you soon!",
        }),
      },
    });
    const { ctx, captured } = fakeCtx();

    const trigger24h: AppointmentReminderTrigger = {
      account_id: "acct-1",
      trigger_data: {
        appointment_id: "ghl-appt-7",
        reminder_type: "24h",
      },
    };

    const result = await handler(
      ctx as unknown as RecipeContext,
      trigger24h,
    );

    assert.equal(result.outcome, "reminder_sent");
    assert.ok(captured.ai);
    assert.ok(captured.ai!.userMessage.includes("tomorrow"));
  });

  it("uses 2h template for 2h reminder", async () => {
    const { post } = fakeGhlPost();
    const { get } = fakeGhlGet();
    const handler = createAppointmentReminderHandler({
      deps: {
        ghlPost: post,
        ghlGet: get,
        getActivationConfig: async () => ({
          reminder24h: "See you tomorrow!",
          reminder2h: "See you in 2 hours!",
        }),
      },
    });
    const { ctx, captured } = fakeCtx();

    const trigger2h: AppointmentReminderTrigger = {
      account_id: "acct-1",
      trigger_data: {
        appointment_id: "ghl-appt-7",
        reminder_type: "2h",
      },
    };

    const result = await handler(
      ctx as unknown as RecipeContext,
      trigger2h,
    );

    assert.equal(result.outcome, "reminder_sent");
    assert.ok(captured.ai);
    assert.ok(captured.ai!.userMessage.includes("2 hours"));
  });

  it("skips when contact has no phone", async () => {
    const { get } = fakeGhlGet();
    const noPhoneGet: GhlGetFn = async () => ({
      id: "ghl-appt-7",
      status: "scheduled",
      startTime: "2026-04-17T10:00:00Z",
      contact: {
        id: "ghl-contact-7",
        name: "John Doe",
        firstName: "John",
        phone: null,
      },
    } as never);
    const handler = createAppointmentReminderHandler({
      deps: {
        ghlGet: noPhoneGet,
        getActivationConfig: async () => ({ reminder24h: "test" }),
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
    const { post } = fakeGhlPost();
    const { get } = fakeGhlGet();
    const handler = createAppointmentReminderHandler({
      deps: {
        ghlPost: post,
        ghlGet: get,
        getActivationConfig: async () => ({ reminder24h: "test" }),
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