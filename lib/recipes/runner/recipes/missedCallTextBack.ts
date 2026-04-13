// ---------------------------------------------------------------------------
// Recipe Handler: Missed Call Text-Back
//
// Ported from lib/n8n/templates/missed-call-text-back.json. Triggered by
// GHL when an inbound call is missed. Runs one Claude Haiku call to
// generate a warm, under-160-char SMS acknowledging the missed call and
// promising a callback, then sends the SMS to the caller via GHL.
//
// Unlike ai-phone-answering (which notifies the operator), this recipe
// replies to the **caller** — the caller's contactId is on the GHL
// webhook body, so no operator lookup is needed.
//
// Flow:
//   1. Parse the webhook body and extract caller metadata + contactId.
//   2. Render the tenant's system prompt (already vertical-resolved).
//   3. Call ctx.ai.messages.create (spend-cap-checked, usage-logged).
//   4. POST /conversations/messages via GHL v2 to deliver the SMS
//      back to the caller.
// ---------------------------------------------------------------------------

import type { Message } from "@anthropic-ai/sdk/resources/messages";

import type { RecipeContext } from "../context.ts";
import type { RecipeResult } from "../index.ts";
import type { GHLWebhookBase, GHLWebhookContactRef } from "@/lib/ghl/webhookTypes";

/**
 * The trigger body we accept. GHL's "missed call" webhook is custom
 * per workflow — it's not a canonical typed event like CallCompleted —
 * so we accept a loose shape with the fields the n8n template and the
 * v2 conversations API rely on.
 */
export interface MissedCallTrigger extends GHLWebhookBase {
  contactId?: string;
  contact_id?: string;
  contact?: GHLWebhookContactRef;
  /** Caller phone number for the "we missed your call from X" context. */
  from?: string;
  phone?: string;
  callDuration?: number;
  direction?: string;
}

export type MissedCallOutcome =
  | "sms_sent"
  | "skipped_no_caller_contact"
  | "skipped_empty_llm_response";

export interface MissedCallResult extends RecipeResult {
  outcome: MissedCallOutcome;
  smsMessageId: string | null;
}

export type GhlPostFn = <T>(
  path: string,
  body: unknown,
  opts: { locationId: string; apiKey: string },
) => Promise<T>;

export interface MissedCallHandlerDeps {
  /** Production default is `ghlPost` from `lib/ghl/client`. */
  ghlPost?: GhlPostFn;
}

export interface MissedCallHandlerOptions {
  deps?: MissedCallHandlerDeps;
}

export function createMissedCallTextBackHandler(
  options: MissedCallHandlerOptions = {},
) {
  return async function missedCallTextBackHandler(
    ctx: RecipeContext,
    trigger: unknown,
  ): Promise<MissedCallResult> {
    const event = (trigger ?? {}) as MissedCallTrigger;

    const callerContactId =
      event.contactId ?? event.contact_id ?? event.contact?.id ?? null;

    // No contact id → we can't send anything back. Bail early with
    // a skipped outcome so the automation_events feed reflects why.
    if (!callerContactId) {
      return {
        outcome: "skipped_no_caller_contact",
        summary: `missed-call-text-back: no caller contact id in payload`,
        smsMessageId: null,
        automationDetail: {
          reason: "no_caller_contact_id",
          caller_phone: event.from ?? event.phone ?? null,
        },
      };
    }

    // Generate the SMS body. The tenant's system prompt already sets
    // the tone constraints (<160 chars, no emojis, warm acknowledgment).
    const userMessage = buildUserMessage(event);
    const response: Message = await ctx.ai.messages.create({
      model: ctx.agent.model,
      max_tokens: ctx.agent.max_tokens,
      ...(ctx.agent.temperature != null
        ? { temperature: ctx.agent.temperature }
        : {}),
      system: ctx.agent.system_prompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const smsBody = extractText(response).trim();
    if (!smsBody) {
      return {
        outcome: "skipped_empty_llm_response",
        summary: `missed-call-text-back: Claude returned empty text`,
        smsMessageId: null,
        automationDetail: {
          reason: "empty_llm_response",
          caller_contact_id: callerContactId,
        },
      };
    }

    const post =
      options.deps?.ghlPost ??
      ((await import("@/lib/ghl/client")).ghlPost as GhlPostFn);

    const smsResponse = await post<{ messageId?: string; id?: string }>(
      "/conversations/messages",
      {
        type: "SMS",
        contactId: callerContactId,
        message: smsBody,
      },
      {
        locationId: ctx.ghl.locationId,
        apiKey: ctx.ghl.accessToken,
      },
    );

    const smsMessageId = smsResponse.messageId ?? smsResponse.id ?? null;
    return {
      outcome: "sms_sent",
      summary: `missed-call-text-back: SMS sent to ${callerContactId}`,
      smsMessageId,
      automationDetail: {
        caller_contact_id: callerContactId,
        caller_phone: event.from ?? event.phone ?? null,
        sms_message_id: smsMessageId,
        sms_body: smsBody,
      },
    };
  };
}

// ── helpers ────────────────────────────────────────────────────────────────

function buildUserMessage(event: MissedCallTrigger): string {
  const caller =
    event.contact?.firstName ??
    event.contact?.name ??
    event.contact?.contactName ??
    null;
  const phone = event.from ?? event.phone ?? event.contact?.phone ?? "unknown";
  const parts: string[] = [];
  parts.push(
    "Write a short, warm SMS to acknowledge a missed call. Include that someone will call back soon. Keep it under 160 characters.",
  );
  if (caller) parts.push(`Caller name: ${caller}`);
  parts.push(`Caller number: ${phone}`);
  return parts.join("\n");
}

function extractText(message: Message): string {
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === "text") parts.push(block.text);
  }
  return parts.join("\n");
}
