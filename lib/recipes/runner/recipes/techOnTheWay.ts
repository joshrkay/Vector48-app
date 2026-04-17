// ---------------------------------------------------------------------------
// Recipe Handler: Tech On-The-Way
//
// Sends an SMS to customers when a technician is dispatched en route.
//
// Flow:
//   1. Extract trigger fields (account_id, contact_id, tech_name, eta)
//   2. Load activation config → get onTheWayMessage template
//   3. Generate notification using AI with tech info
//   4. Send SMS via GHL
//   5. Return result
// ---------------------------------------------------------------------------

import type { Message } from "@anthropic-ai/sdk/resources/messages";

import type { RecipeContext } from "../context.ts";

export interface TechOnTheWayTrigger {
  account_id: string;
  trigger_data: {
    contact_id: string;
    tech_name?: string;
    eta?: number;
  };
}

export type TechOnTheWayOutcome =
  | "notification_sent"
  | "skipped_no_activation_config"
  | "skipped_no_contact"
  | "skipped_no_message";

export interface TechOnTheWayResult {
  outcome: TechOnTheWayOutcome;
  smsBody: string | null;
  messageId: string | null;
  reason?: string;
}

export type GhlPostFn = <T>(
  path: string,
  body: unknown,
  opts: { locationId: string; apiKey: string },
) => Promise<T>;

export interface TechOnTheWayHandlerDeps {
  ghlPost?: GhlPostFn;
  getActivationConfig?: (
    accountId: string,
    recipeSlug: string,
  ) => Promise<{
    onTheWayMessage?: string;
    includeTechName?: boolean;
    businessName?: string;
  } | null>;
  getCallerContact?: (
    contactId: string,
    ctx: RecipeContext,
  ) => Promise<{ name: string; firstName?: string; phone?: string } | null>;
}

export interface TechOnTheWayHandlerOptions {
  deps?: TechOnTheWayHandlerDeps;
}

export function createTechOnTheWayHandler(
  options: TechOnTheWayHandlerOptions = {},
) {
  return async function techOnTheWayHandler(
    ctx: RecipeContext,
    trigger: TechOnTheWayTrigger,
  ): Promise<TechOnTheWayResult> {
    const { contact_id, tech_name, eta } = trigger.trigger_data;

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

    const includeTechName = activationConfig.includeTechName ?? true;

    const smsBody = await generateNotification(
      ctx,
      callerContact,
      activationConfig.onTheWayMessage,
      activationConfig.businessName,
      tech_name,
      eta,
      includeTechName,
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
      outcome: "notification_sent",
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
    onTheWayMessage?: string;
    includeTechName?: boolean;
    businessName?: string;
  } | null>,
): Promise<{
  onTheWayMessage?: string;
  includeTechName?: boolean;
  businessName?: string;
} | null> {
  if (customLoader) {
    return customLoader(accountId, "tech-on-the-way");
  }

  const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("recipe_activations")
    .select("config")
    .eq("account_id", accountId)
    .eq("recipe_slug", "tech-on-the-way")
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
    onTheWayMessage: typeof config.onTheWayMessage === "string"
      ? config.onTheWayMessage
      : undefined,
    includeTechName: typeof config.includeTechName === "boolean"
      ? config.includeTechName
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

async function generateNotification(
  ctx: RecipeContext,
  callerContact: { name: string; firstName?: string },
  templateMessage?: string,
  businessName?: string,
  techName?: string,
  eta?: number,
  includeTechName: boolean = true,
): Promise<string | null> {
  const business = businessName ? ` from ${businessName}` : "";
  const techInfo = includeTechName && techName
    ? `Your technician ${techName} `
    : "Your technician ";
  const etaInfo = eta ? `is on the way and should arrive in about ${eta} minutes.` : "is on the way.";

  const userMessage = templateMessage
    ? `Write a notification${business} for ${callerContact.firstName ?? callerContact.name}. ` +
      `Include: "${templateMessage}". ` +
      "Keep it under 300 characters, friendly and informative."
    : `Write a friendly notification${business} for ${callerContact.firstName ?? callerContact.name}. ` +
      `Say ${techInfo}${etaInfo} ` +
      "Keep it under 300 characters.";

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