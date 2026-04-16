// ---------------------------------------------------------------------------
// Recipe Handler: Review Request
//
// Triggered after a job is marked complete in GHL. Generates a personalized
// review-request SMS and sends it to the customer with a Google review link.
//
// Flow:
//   1. Extract trigger fields (account_id, contact_id, review_link)
//   2. Load activation config → get reviewLink (primary) or fallback from trigger
//   3. Fetch contact from GHL for personalization
//   4. Call ctx.ai.messages.create with [REVIEW_LINK] token
//   5. Replace token with actual link + truncate if >300 chars
//   6. Send SMS via GHL
//   7. Return result
// ---------------------------------------------------------------------------

import type { Message } from "@anthropic-ai/sdk/resources/messages";

import type { RecipeContext } from "../context.ts";

export interface ReviewRequestTrigger {
  account_id: string;
  trigger_data: {
    contact_id: string;
    review_link?: string;
  };
}

export type ReviewRequestOutcome =
  | "review_request_sent"
  | "skipped_no_contact"
  | "skipped_no_review_link"
  | "skipped_no_sms_content"
  | "skipped_no_activation_config";

export interface ReviewRequestResult {
  outcome: ReviewRequestOutcome;
  smsBody: string | null;
  messageId: string | null;
}

export type GhlPostFn = <T>(
  path: string,
  body: unknown,
  opts: { locationId: string; apiKey: string },
) => Promise<T>;

export interface ReviewRequestHandlerDeps {
  ghlPost?: GhlPostFn;
  getActivationConfig?: (
    accountId: string,
    recipeSlug: string,
  ) => Promise<{ reviewLink?: string } | null>;
  getCallerContact?: (
    contactId: string,
    ctx: RecipeContext,
  ) => Promise<{ name: string; firstName?: string; phone?: string } | null>;
}

export interface ReviewRequestHandlerOptions {
  deps?: ReviewRequestHandlerDeps;
}

const REVIEW_LINK_PLACEHOLDER = "[REVIEW_LINK]";
const MAX_SMS_LENGTH = 300;

export function createReviewRequestHandler(
  options: ReviewRequestHandlerOptions = {},
) {
  return async function reviewRequestHandler(
    ctx: RecipeContext,
    trigger: ReviewRequestTrigger,
  ): Promise<ReviewRequestResult> {
    const { contact_id } = trigger.trigger_data;
    const triggerReviewLink = trigger.trigger_data.review_link;

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

    const reviewLink = resolveReviewLink(
      activationConfig.reviewLink,
      triggerReviewLink,
    );

    if (!reviewLink) {
      return {
        outcome: "skipped_no_review_link",
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

    const smsBody = await generateReviewRequest(
      ctx,
      callerContact,
      reviewLink,
    );

    if (!smsBody) {
      return {
        outcome: "skipped_no_sms_content",
        smsBody: null,
        messageId: null,
      };
    }

    if (!callerContact.phone) {
      return {
        outcome: "skipped_no_contact",
        smsBody,
        messageId: null,
      };
    }

    const messageId = await sendSms(
      trigger.trigger_data.contact_id,
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

function resolveReviewLink(
  configLink?: string,
  triggerLink?: string,
): string | null {
  const fromConfig = configLink?.trim() ?? "";
  const fromTrigger = triggerLink?.trim() ?? "";

  if (fromConfig) return fromConfig;
  if (fromTrigger) return fromTrigger;
  return null;
}

async function loadActivationConfig(
  accountId: string,
  customLoader?: (
    accountId: string,
    recipeSlug: string,
  ) => Promise<{ reviewLink?: string } | null>,
): Promise<{ reviewLink?: string } | null> {
  if (customLoader) {
    return customLoader(accountId, "review-request");
  }

  const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("recipe_activations")
    .select("config")
    .eq("account_id", accountId)
    .eq("recipe_slug", "review-request")
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
    reviewLink: typeof config.reviewLink === "string" ? config.reviewLink : undefined,
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
  reviewLink: string,
): Promise<string | null> {
  const userMessage = `Write a friendly review request message for ${callerContact.firstName ?? callerContact.name}. ` +
    `Include the literal token ${REVIEW_LINK_PLACEHOLDER} where the review link should go. ` +
    `Keep the message under 300 characters, warm and grateful, no emojis.`;

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

  let smsBody = content.replace(REVIEW_LINK_PLACEHOLDER, reviewLink);

  if (!smsBody.includes(reviewLink)) {
    smsBody = smsBody.trim() + " " + reviewLink;
  }

  if (smsBody.length > MAX_SMS_LENGTH) {
    const availableForMessage = MAX_SMS_LENGTH - reviewLink.length;
    if (availableForMessage > 50) {
      smsBody = smsBody.slice(0, availableForMessage - 3) + "...";
    } else {
      smsBody = "Thanks for choosing us! " + reviewLink;
    }
  }

  return smsBody;
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