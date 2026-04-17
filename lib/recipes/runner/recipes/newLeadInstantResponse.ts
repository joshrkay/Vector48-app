// ---------------------------------------------------------------------------
// Recipe Handler: New Lead Instant Response
//
// Sends an instant personalized SMS to new leads within seconds of them entering the system.
// Speed-to-lead is the #1 factor in conversion.
//
// Flow:
//   1. Extract trigger fields (account_id, contact_id)
//   2. Load activation config → get responseMessage, responseDelaySec
//   3. Fetch contact from GHL for personalization
//   4. Generate response using AI
//   5. Send SMS via GHL
//   6. Return result
// ---------------------------------------------------------------------------

import type { Message } from "@anthropic-ai/sdk/resources/messages";

import type { RecipeContext } from "../context.ts";

export interface NewLeadInstantResponseTrigger {
  account_id: string;
  trigger_data: {
    contact_id: string;
  };
}

export type NewLeadInstantResponseOutcome =
  | "response_sent"
  | "skipped_no_activation_config"
  | "skipped_no_contact"
  | "skipped_no_message";

export interface NewLeadInstantResponseResult {
  outcome: NewLeadInstantResponseOutcome;
  smsBody: string | null;
  messageId: string | null;
  reason?: string;
}

export type GhlPostFn = <T>(
  path: string,
  body: unknown,
  opts: { locationId: string; apiKey: string },
) => Promise<T>;

export interface NewLeadInstantResponseHandlerDeps {
  ghlPost?: GhlPostFn;
  getActivationConfig?: (
    accountId: string,
    recipeSlug: string,
  ) => Promise<{
    responseMessage?: string;
    responseDelaySec?: number;
    businessName?: string;
  } | null>;
  getCallerContact?: (
    contactId: string,
    ctx: RecipeContext,
  ) => Promise<{ name: string; firstName?: string; phone?: string } | null>;
}

export interface NewLeadInstantResponseHandlerOptions {
  deps?: NewLeadInstantResponseHandlerDeps;
}

export function createNewLeadInstantResponseHandler(
  options: NewLeadInstantResponseHandlerOptions = {},
) {
  return async function newLeadInstantResponseHandler(
    ctx: RecipeContext,
    trigger: NewLeadInstantResponseTrigger,
  ): Promise<NewLeadInstantResponseResult> {
    const { contact_id } = trigger.trigger_data;

    const activationConfig = await loadActivationConfig(
      trigger.account_id,
      options.deps?.getActivationConfig,
    );

    if (!activationConfig) {
      return {
        outcome: "skipped_no_activation_config",
        smsBody: null,
        messageId: null,
      };
    }

    const callerContact = await (options.deps?.getCallerContact ?? fetchCallerContact)(
      contact_id,
      ctx,
    );

    if (!callerContact) {
      return {
        outcome: "skipped_no_contact",
        smsBody: null,
        messageId: null,
      };
    }

    const smsBody = await generateResponse(
      ctx,
      callerContact,
      activationConfig.responseMessage,
      activationConfig.businessName,
    );

    if (!smsBody) {
      return {
        outcome: "skipped_no_message",
        smsBody: null,
        messageId: null,
      };
    }

    if (!callerContact.phone) {
      return {
        outcome: "skipped_no_message",
        smsBody: null,
        messageId: null,
        reason: "No phone on contact",
      };
    }

    const messageId = await sendSms(
      contact_id,
      smsBody,
      ctx,
      options.deps?.ghlPost,
    );

    return {
      outcome: "response_sent",
      smsBody,
      messageId,
    };
  };
}

async function loadActivationConfig(
  accountId: string,
  customLoader?: (
    accountId: string,
    recipeSlug: string,
  ) => Promise<{
    responseMessage?: string;
    responseDelaySec?: number;
    businessName?: string;
  } | null>,
): Promise<{
  responseMessage?: string;
  responseDelaySec?: number;
  businessName?: string;
} | null> {
  if (customLoader) {
    return customLoader(accountId, "new-lead-instant-response");
  }

  const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("recipe_activations")
    .select("config")
    .eq("account_id", accountId)
    .eq("recipe_slug", "new-lead-instant-response")
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
    responseMessage: typeof config.responseMessage === "string"
      ? config.responseMessage
      : undefined,
    responseDelaySec: typeof config.responseDelaySec === "number"
      ? config.responseDelaySec
      : undefined,
    businessName: typeof config.businessName === "string"
      ? config.businessName
      : undefined,
  };
}

async function fetchCallerContact(
  contactId: string,
  ctx: RecipeContext,
): Promise<{ name: string; firstName?: string; phone?: string } | null> {
  try {
    const { getContact } = await import("@/lib/ghl/contacts");
    const contact = await getContact(contactId, {
      locationId: ctx.ghl.locationId,
      apiKey: ctx.ghl.accessToken,
    });

    if (!contact || !contact.contact) {
      return null;
    }

    const c = contact.contact;
    return {
      name: c.name ?? c.firstName ?? "Customer",
      firstName: c.firstName ?? undefined,
      phone: c.phone ?? undefined,
    };
  } catch {
    return null;
  }
}

async function generateResponse(
  ctx: RecipeContext,
  callerContact: { name: string; firstName?: string },
  templateMessage?: string,
  businessName?: string,
): Promise<string | null> {
  const business = businessName ? ` from ${businessName}` : "";

  const userMessage = templateMessage
    ? `Write a friendly welcome message${business} for ${callerContact.firstName ?? callerContact.name}. ` +
      `Include this message: "${templateMessage}". ` +
      "Keep it under 300 characters, warm and professional."
    : `Write a friendly welcome message${business} for ${callerContact.firstName ?? callerContact.name}. ` +
      "Introduce your business and ask how you can help. " +
      "Keep it under 300 characters, warm and professional.";

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
  if (!content) {
    return null;
  }

  return content.length > 300 ? content.slice(0, 297) + "..." : content;
}

function extractText(message: Message): string {
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === "text") parts.push(block.text);
  }
  return parts.join("\n");
}

async function sendSms(
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