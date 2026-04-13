// ---------------------------------------------------------------------------
// Recipe Handler: AI Phone Answering (Phase 2 POC)
//
// Ported from lib/n8n/templates/ai-phone-answering-v2.json. Triggered by
// the GHL post-call webhook after an AI-answered call completes. Runs one
// Claude Haiku call to summarize the transcript, then sends the summary as
// an SMS to the business owner's notification contact via GHL.
//
// Flow:
//   1. Extract transcript + caller metadata from the GHLWebhookCallCompleted
//      payload.
//   2. Render the tenant's system prompt (already vertical-resolved during
//      activation) and attach the transcript as a user message.
//   3. Call ctx.ai.messages.create (spend-cap-checked, usage-logged).
//   4. POST /conversations/messages via GHL v2 to deliver the summary SMS
//      to the account's notification contact.
//
// Returns a PhoneAnsweringResult describing what was done so the caller
// (webhook route or Inngest step) can write automation_events.
// ---------------------------------------------------------------------------

import type { Message } from "@anthropic-ai/sdk/resources/messages";

import type { RecipeContext } from "../context.ts";
import type { RecipeResult } from "../index.ts";
import type { GHLWebhookCallCompleted } from "@/lib/ghl/webhookTypes";

/**
 * This handler's trigger *is* a `GHLWebhookCallCompleted` body — no
 * wrapper. The webhook route passes the parsed JSON body directly to
 * `runRecipe` so recipes don't share a single hardcoded envelope shape.
 */
export type PhoneAnsweringTrigger = GHLWebhookCallCompleted;

export type PhoneAnsweringOutcome =
  | "summary_sent"
  | "skipped_no_transcript"
  | "skipped_no_notification_contact";

export interface PhoneAnsweringResult extends RecipeResult {
  outcome: PhoneAnsweringOutcome;
  smsMessageId: string | null;
}

/**
 * Minimal shape of the GHL POST helper the recipe uses. Tests inject a
 * fake; production wires in `ghlPost` from `lib/ghl/client`.
 */
export type GhlPostFn = <T>(
  path: string,
  body: unknown,
  opts: { locationId: string; apiKey: string },
) => Promise<T>;

export interface PhoneAnsweringHandlerDeps {
  /** Production default is `ghlPost` from `lib/ghl/client`. */
  ghlPost?: GhlPostFn;
}

export interface PhoneAnsweringHandlerOptions {
  deps?: PhoneAnsweringHandlerDeps;
}

/**
 * Recipe handler for `ai-phone-answering`. Exported as a factory so tests
 * can inject a fake GHL client without module monkey-patching, and so the
 * registry binding in runner/index.ts can pass production deps.
 */
export function createAiPhoneAnsweringHandler(
  options: PhoneAnsweringHandlerOptions = {},
) {
  return async function aiPhoneAnsweringHandler(
    ctx: RecipeContext,
    trigger: unknown,
  ): Promise<PhoneAnsweringResult> {
    // Each handler parses its own trigger shape. This keeps the webhook
    // route recipe-agnostic — it passes the raw webhook body through.
    const call = (trigger ?? {}) as PhoneAnsweringTrigger;

    const transcript = extractTranscript(call);
    if (!transcript) {
      return {
        outcome: "skipped_no_transcript",
        summary: `ai-phone-answering: skipped, no transcript in payload`,
        smsMessageId: null,
        automationDetail: { reason: "no_transcript" },
      };
    }

    // Generate the call summary. ctx.ai is the tracked client — this call
    // enforces the spend cap pre-flight and writes an llm_usage_events row
    // on success, keyed by accountId + recipe_slug + tenant_agent_id.
    const userMessage = buildUserMessage(call, transcript);
    const response: Message = await ctx.ai.messages.create({
      model: ctx.agent.model,
      max_tokens: ctx.agent.max_tokens,
      ...(ctx.agent.temperature != null
        ? { temperature: ctx.agent.temperature }
        : {}),
      system: ctx.agent.system_prompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const summaryText = extractText(response).trim();
    if (!summaryText) {
      return {
        outcome: "skipped_no_transcript",
        summary: `ai-phone-answering: empty Claude response`,
        smsMessageId: null,
        automationDetail: { reason: "empty_llm_response" },
      };
    }

    // Decide where to send the summary. Prefer an operator-configured
    // notification contact id stored on the account. We don't fall back
    // to the caller — the operator wants a summary to *their* phone, not
    // a reply to the customer.
    const notificationContactId =
      typeof ctx.agent.tool_config["notification_contact_id"] === "string"
        ? (ctx.agent.tool_config["notification_contact_id"] as string)
        : null;

    if (!notificationContactId) {
      return {
        outcome: "skipped_no_notification_contact",
        summary: `ai-phone-answering: summary generated but no notification contact configured`,
        smsMessageId: null,
        automationDetail: {
          reason: "no_notification_contact",
          generated_summary: summaryText,
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
        contactId: notificationContactId,
        message: formatSmsBody(summaryText, ctx.account.business_name),
      },
      {
        locationId: ctx.ghl.locationId,
        apiKey: ctx.ghl.accessToken,
      },
    );

    const smsMessageId = smsResponse.messageId ?? smsResponse.id ?? null;
    return {
      outcome: "summary_sent",
      summary: `ai-phone-answering: summary sent to ${notificationContactId}`,
      smsMessageId,
      automationDetail: {
        notification_contact_id: notificationContactId,
        sms_message_id: smsMessageId,
        summary_text: summaryText,
      },
    };
  };
}

// ── helpers ────────────────────────────────────────────────────────────────

function extractTranscript(call: GHLWebhookCallCompleted): string | null {
  const raw = call.transcription ?? call.summary ?? null;
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildUserMessage(
  call: GHLWebhookCallCompleted,
  transcript: string,
): string {
  const caller =
    call.contact?.firstName ??
    call.contact?.name ??
    call.contact?.contactName ??
    "an unknown caller";
  const duration = call.callDuration ?? call.duration;
  const meta = duration ? `\nCall duration: ${duration}s` : "";
  return `Caller: ${caller}${meta}\n\nTranscript:\n${transcript}`;
}

function extractText(message: Message): string {
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === "text") parts.push(block.text);
  }
  return parts.join("\n");
}

function formatSmsBody(summary: string, businessName: string): string {
  // SMS-safe: no emojis, short header, then summary. Matches the tone of
  // the existing n8n template's owner-notification node.
  return `AI call summary for ${businessName}:\n\n${summary}`;
}
