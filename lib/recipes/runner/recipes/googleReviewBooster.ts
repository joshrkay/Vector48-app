// ---------------------------------------------------------------------------
// Recipe Handler: Google Review Booster
//
// Sends a review request SMS after a job is completed.
// Uses the business's Google review link from config.
//
// Flow:
//   1. Extract trigger fields (account_id, contact_id, job_id)
//   2. Load activation config → get googleReviewLink
//   3. Fetch contact for personalization
//   4. Generate review request using AI
//   5. Send SMS via GHL
//   6. Return result
// ---------------------------------------------------------------------------

import type { Message } from "@anthropic-ai/sdk/resources/messages";

import type { RecipeContext } from "../context.ts";

export interface GoogleReviewBoosterTrigger {
  account_id: string;
  trigger_data: {
    contact_id: string;
    job_id?: string;
  };
}

export type GoogleReviewBoosterOutcome =
  | "review_request_sent"
  | "skipped_no_activation_config"
  | "skipped_no_contact"
  | "skipped_no_google_link"
  | "skipped_no_message";

export interface GoogleReviewBoosterResult {
  outcome: GoogleReviewBoosterOutcome;
  smsBody: string | null;
  messageId: string | null;
  reason?: string;
}

export type GhlPostFn = <T>(
  path: string,
  body: unknown,
  opts: { locationId: string; apiKey: string },
) => Promise<T>;

export interface GoogleReviewBoosterHandlerDeps {
  ghlPost?: GhlPostFn;
  getActivationConfig?: (
    accountId: string,
    recipeSlug: string,
  ) => Promise<{
    googleReviewLink?: string;
    businessName?: string;
  } | null>;
  getCallerContact?: (
    contactId: string,
    ctx: RecipeContext,
  ) => Promise<{ name: string; firstName?: string; phone?: string } | null>;
}

export interface GoogleReviewBoosterHandlerOptions {
  deps?: GoogleReviewBoosterHandlerDeps;
}

export function createGoogleReviewBoosterHandler(
  options: GoogleReviewBoosterHandlerOptions = {},
) {
  return async function googleReviewBoosterHandler(
    ctx: RecipeContext,
    trigger: GoogleReviewBoosterTrigger,
  ): Promise<GoogleReviewBoosterResult> {
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

    if (!activationConfig.googleReviewLink) {
      return {
        outcome: "skipped_no_google_link",
        smsBody: null,
        messageId: null,
        reason: "No Google review link configured",
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

    const smsBody = await generateReviewRequest(
      ctx,
      callerContact,
      activationConfig.googleReviewLink,
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
      outcome: "review_request_sent",
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
    googleReviewLink?: string;
    businessName?: string;
  } | null>,
): Promise<{
  googleReviewLink?: string;
  businessName?: string;
} | null> {
  if (customLoader) {
    return customLoader(accountId, "google-review-booster");
  }

  const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("recipe_activations")
    .select("config")
    .eq("account_id", accountId)
    .eq("recipe_slug", "google-review-booster")
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
    googleReviewLink: typeof config.googleReviewLink === "string"
      ? config.googleReviewLink
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

async function generateReviewRequest(
  ctx: RecipeContext,
  callerContact: { name: string; firstName?: string },
  googleReviewLink: string,
  businessName?: string,
): Promise<string | null> {
  const business = businessName ? ` from ${businessName}` : "";

  const userMessage = `Write a friendly Google review request${business} for ${callerContact.firstName ?? callerContact.name}. ` +
    `Thank them for their business and kindly ask for a Google review. ` +
    `Include this link: ${googleReviewLink}. ` +
    "Keep it under 300 characters, warm and appreciative.";

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