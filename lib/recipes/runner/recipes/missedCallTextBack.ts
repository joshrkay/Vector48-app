// ---------------------------------------------------------------------------
// Recipe Handler: Missed Call Text-Back
//
// Triggered when an inbound call is missed. Generates a warm, friendly SMS
// acknowledging the missed call and promising a callback, then sends it to
// the caller via GHL. Optionally sends a summary to the business owner.
//
// Flow:
//   1. Extract trigger fields (account_id, contact_id, owner_contact_id)
//   2. Load recipe_activations config (textBackMessage, ownerContactId)
//   3. Fetch caller contact from GHL for personalization
//   4. Call ctx.ai.messages.create to generate SMS body (under 160 chars)
//   5. Send SMS to caller via GHL
//   6. If owner configured, send summary to owner
//   7. Return result with message IDs
// ---------------------------------------------------------------------------

import type { Message } from "@anthropic-ai/sdk/resources/messages";

import type { RecipeContext } from "../context.ts";

export interface MissedCallTextBackTrigger {
  /** Account UUID */
  account_id: string;
  /** GHL contact ID of the caller */
  contact_id: string;
  /** Optional GHL call ID */
  call_id?: string;
  /** Always "missed" for this recipe */
  call_status: "missed";
  /** Optional owner contact to notify */
  owner_contact_id?: string;
}

export type MissedCallTextBackOutcome =
  | "text_back_sent"
  | "skipped_no_caller_contact"
  | "skipped_no_activation_config"
  | "skipped_no_sms_content";

export interface MissedCallTextBackResult {
  outcome: MissedCallTextBackOutcome;
  /** Generated SMS body (for logging) */
  smsBody: string | null;
  /** GHL message ID from caller SMS */
  callerMessageId: string | null;
  /** GHL message ID from owner SMS (if sent) */
  ownerMessageId: string | null;
}

export type GhlPostFn = <T>(
  path: string,
  body: unknown,
  opts: { locationId: string; apiKey: string },
) => Promise<T>;

export interface MissedCallTextBackHandlerDeps {
  ghlPost?: GhlPostFn;
  getActivationConfig?: (
    accountId: string,
    recipeSlug: string,
  ) => Promise<{
    textBackMessage?: string;
    ownerContactId?: string;
  } | null>;
  getCallerContact?: (
    contactId: string,
    ctx: RecipeContext,
  ) => Promise<{ name: string; firstName?: string } | null>;
}

export interface MissedCallTextBackHandlerOptions {
  deps?: MissedCallTextBackHandlerDeps;
}

export function createMissedCallTextBackHandler(
  options: MissedCallTextBackHandlerOptions = {},
) {
  return async function missedCallTextBackHandler(
    ctx: RecipeContext,
    trigger: MissedCallTextBackTrigger,
  ): Promise<MissedCallTextBackResult> {
    const { contact_id, owner_contact_id } = trigger;

    const activationConfig = await loadActivationConfig(
      trigger.account_id,
      options.deps?.getActivationConfig,
    );

    if (!activationConfig) {
      return {
        outcome: "skipped_no_activation_config",
        smsBody: null,
        callerMessageId: null,
        ownerMessageId: null,
      };
    }

    const callerContact = await (options.deps?.getCallerContact ?? fetchCallerContact)(
      contact_id,
      ctx,
    );

    if (!callerContact) {
      const ownerContactId = resolveOwnerContact(
        owner_contact_id,
        activationConfig.ownerContactId,
      );
      let ownerMessageId: string | null = null;

      if (ownerContactId) {
        ownerMessageId = await sendOwnerNotification(
          ctx,
          ownerContactId,
          "Caller contact not found",
          options.deps?.ghlPost,
        );
      }

      return {
        outcome: "skipped_no_caller_contact",
        smsBody: null,
        callerMessageId: null,
        ownerMessageId,
      };
    }

    const smsBody = await generateTextBack(
      ctx,
      callerContact,
      activationConfig.textBackMessage,
    );

    if (!smsBody) {
      return {
        outcome: "skipped_no_sms_content",
        smsBody: null,
        callerMessageId: null,
        ownerMessageId: null,
      };
    }

    const callerMessageId = await sendSmsToCaller(
      contact_id,
      smsBody,
      ctx,
      options.deps?.ghlPost,
    );

    const ownerContactId = resolveOwnerContact(
      owner_contact_id,
      activationConfig.ownerContactId,
    );
    let ownerMessageId: string | null = null;

    if (ownerContactId) {
      ownerMessageId = await sendOwnerNotification(
        ctx,
        ownerContactId,
        smsBody,
        options.deps?.ghlPost,
      );
    }

    return {
      outcome: "text_back_sent",
      smsBody,
      callerMessageId,
      ownerMessageId,
    };
  };
}

async function loadActivationConfig(
  accountId: string,
  customLoader?: (
    accountId: string,
    recipeSlug: string,
  ) => Promise<{ textBackMessage?: string; ownerContactId?: string } | null>,
): Promise<{ textBackMessage?: string; ownerContactId?: string } | null> {
  if (customLoader) {
    return customLoader(accountId, "missed-call-text-back");
  }

  const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("recipe_activations")
    .select("config")
    .eq("account_id", accountId)
    .eq("recipe_slug", "missed-call-text-back")
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const config = data.config as Record<string, unknown> | null;
  if (!config) {
    return null;
  }

  return {
    textBackMessage: typeof config.textBackMessage === "string"
      ? config.textBackMessage
      : undefined,
    ownerContactId: typeof config.ownerContactId === "string"
      ? config.ownerContactId
      : undefined,
  };
}

async function fetchCallerContact(
  contactId: string,
  ctx: RecipeContext,
): Promise<{ name: string; firstName?: string } | null> {
  try {
    const { getContact } = await import("@/lib/ghl/contacts");
    const contact = await getContact(contactId, {
      locationId: ctx.ghl.locationId,
      apiKey: ctx.ghl.accessToken,
    });

    if (!contact || !contact.contact) {
      return null;
    }

    return {
      name: contact.contact.name ?? contact.contact.firstName ?? "Customer",
      firstName: contact.contact.firstName ?? undefined,
    };
  } catch {
    return null;
  }
}

async function generateTextBack(
  ctx: RecipeContext,
  callerContact: { name: string; firstName?: string },
  customTemplate?: string,
): Promise<string | null> {
  const userMessage = customTemplate
    ? `Caller: ${callerContact.name}\n\n${customTemplate}`
    : `Write a text-back message for a missed call from ${callerContact.firstName ?? callerContact.name}. Keep it under 160 characters, warm and professional, no emojis.`;

  const response: Message = await ctx.ai.messages.create({
    model: ctx.agent.model,
    max_tokens: ctx.agent.max_tokens,
    ...(ctx.agent.temperature != null
      ? { temperature: ctx.agent.temperature }
      : {}),
    system: ctx.agent.system_prompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const content = extractText(response).trim();
  return content.length > 0 ? content : null;
}

function extractText(message: Message): string {
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === "text") parts.push(block.text);
  }
  return parts.join("\n");
}

function resolveOwnerContact(
  webhookOwnerId?: string,
  configOwnerId?: string,
): string | null {
  return webhookOwnerId ?? configOwnerId ?? null;
}

async function sendSmsToCaller(
  contactId: string,
  message: string,
  ctx: RecipeContext,
  ghlPost?: GhlPostFn,
): Promise<string | null> {
  const post =
    ghlPost ??
    ((await import("@/lib/ghl/client")).ghlPost as GhlPostFn);

  try {
    const response = await post<{ messageId?: string; id?: string }>(
      "/conversations/messages",
      {
        type: "SMS",
        contactId,
        message,
      },
      {
        locationId: ctx.ghl.locationId,
        apiKey: ctx.ghl.accessToken,
      },
    );

    return response.messageId ?? response.id ?? null;
  } catch {
    return null;
  }
}

async function sendOwnerNotification(
  ctx: RecipeContext,
  ownerContactId: string,
  callerMessage: string,
  ghlPost?: GhlPostFn,
): Promise<string | null> {
  const post =
    ghlPost ??
    ((await import("@/lib/ghl/client")).ghlPost as GhlPostFn);

  const ownerMessage = `Missed call alert for ${ctx.account.business_name}:\n\n"${callerMessage}"`;

  try {
    const response = await post<{ messageId?: string; id?: string }>(
      "/conversations/messages",
      {
        type: "SMS",
        contactId: ownerContactId,
        message: ownerMessage,
      },
      {
        locationId: ctx.ghl.locationId,
        apiKey: ctx.ghl.accessToken,
      },
    );

    return response.messageId ?? response.id ?? null;
  } catch {
    return null;
  }
}