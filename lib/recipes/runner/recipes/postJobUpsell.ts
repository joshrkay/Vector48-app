// ---------------------------------------------------------------------------
// Recipe Handler: Post-Job Upsell
//
// Sends a personalized upsell SMS after a job is completed.
// Suggests related services based on the job type.
//
// Flow:
//   1. Extract trigger fields (account_id, contact_id, job_type)
//   2. Load activation config → get upsellMessage, upsellDelayDays
//   3. Fetch contact for personalization
//   4. Generate upsell recommendation using AI
//   5. Send SMS via GHL
//   6. Return result
// ---------------------------------------------------------------------------

import type { Message } from "@anthropic-ai/sdk/resources/messages";

import type { RecipeContext } from "../context.ts";
import { sanitizeForPrompt } from "../promptSanitize.ts";

export interface PostJobUpsellTrigger {
  account_id: string;
  trigger_data: {
    contact_id: string;
    job_type?: string;
  };
}

export type PostJobUpsellOutcome =
  | "upsell_sent"
  | "skipped_no_activation_config"
  | "skipped_no_contact"
  | "skipped_no_message";

export interface PostJobUpsellResult {
  outcome: PostJobUpsellOutcome;
  smsBody: string | null;
  messageId: string | null;
  reason?: string;
}

export type GhlPostFn = <T>(
  path: string,
  body: unknown,
  opts: { locationId: string; apiKey: string },
) => Promise<T>;

export interface PostJobUpsellHandlerDeps {
  ghlPost?: GhlPostFn;
  getActivationConfig?: (
    accountId: string,
    recipeSlug: string,
  ) => Promise<{
    upsellMessage?: string;
    upsellDelayDays?: number;
    businessName?: string;
  } | null>;
  getCallerContact?: (
    contactId: string,
    ctx: RecipeContext,
  ) => Promise<{ name: string; firstName?: string; phone?: string } | null>;
}

export interface PostJobUpsellHandlerOptions {
  deps?: PostJobUpsellHandlerDeps;
}

export function createPostJobUpsellHandler(
  options: PostJobUpsellHandlerOptions = {},
) {
  return async function postJobUpsellHandler(
    ctx: RecipeContext,
    trigger: PostJobUpsellTrigger,
  ): Promise<PostJobUpsellResult> {
    const { contact_id, job_type } = trigger.trigger_data;

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

    const smsBody = await generateUpsell(
      ctx,
      callerContact,
      activationConfig.upsellMessage,
      activationConfig.businessName,
      job_type,
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
      outcome: "upsell_sent",
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
    upsellMessage?: string;
    upsellDelayDays?: number;
    businessName?: string;
  } | null>,
): Promise<{
  upsellMessage?: string;
  upsellDelayDays?: number;
  businessName?: string;
} | null> {
  if (customLoader) {
    return customLoader(accountId, "post-job-upsell");
  }

  const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("recipe_activations")
    .select("config")
    .eq("account_id", accountId)
    .eq("recipe_slug", "post-job-upsell")
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
    upsellMessage: typeof config.upsellMessage === "string"
      ? config.upsellMessage
      : undefined,
    upsellDelayDays: typeof config.upsellDelayDays === "number"
      ? config.upsellDelayDays
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

async function generateUpsell(
  ctx: RecipeContext,
  callerContact: { name: string; firstName?: string },
  templateMessage?: string,
  businessName?: string,
  jobType?: string,
): Promise<string | null> {
  const safeName =
    sanitizeForPrompt(callerContact.firstName ?? callerContact.name, {
      maxLen: 120,
    }) || "Customer";
  const safeBusiness = sanitizeForPrompt(businessName, { maxLen: 120 });
  const safeJob = sanitizeForPrompt(jobType, { maxLen: 80 });
  const safeTemplate = sanitizeForPrompt(templateMessage, { maxLen: 500 });
  const business = safeBusiness ? ` from ${safeBusiness}` : "";
  const jobContext = safeJob ? ` related to ${safeJob}` : "";

  const userMessage = safeTemplate
    ? `Write a friendly upsell message${business} for ${safeName}${jobContext}. ` +
      `Include this: "${safeTemplate}". ` +
      "Keep it under 300 characters, helpful not salesy."
    : `Write a friendly post-job upsell message${business} for ${safeName}${jobContext}. ` +
      `Suggest related services they might need. ` +
      "Keep it under 300 characters, helpful not salesy.";

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