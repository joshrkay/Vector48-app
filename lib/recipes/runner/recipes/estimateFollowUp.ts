// ---------------------------------------------------------------------------
// Recipe Handler: Estimate Follow-Up
//
// Sends personalized follow-up SMS after estimate is sent. Checks opportunity
// status - only sends if still open.
//
// Flow:
//   1. Extract trigger fields (account_id, opportunity_id, follow_up_attempt)
//   2. Load activation config → get followUpMessage, business_name
//   3. Fetch opportunity from GHL API
//   4. If status !== "open" → skip with reason
//   5. Generate SMS using AI (uses follow_up_attempt for tone)
//   6. Send SMS via GHL
//   7. Return result
// ---------------------------------------------------------------------------

import type { Message } from "@anthropic-ai/sdk/resources/messages";

import type { RecipeContext } from "../context.ts";
import { sanitizeForPrompt } from "../promptSanitize.ts";

export interface EstimateFollowUpTrigger {
  account_id: string;
  trigger_data: {
    opportunity_id: string;
    follow_up_attempt: number;
  };
}

export type EstimateFollowUpOutcome =
  | "estimate_follow_up_sent"
  | "skipped_not_open"
  | "skipped_no_activation_config"
  | "skipped_no_opportunity"
  | "skipped_no_message";

export interface EstimateFollowUpResult {
  outcome: EstimateFollowUpOutcome;
  smsBody: string | null;
  messageId: string | null;
  reason?: string;
}

export type GhlPostFn = <T>(
  path: string,
  body: unknown,
  opts: { locationId: string; apiKey: string },
) => Promise<T>;

export type GhlGetFn = <T>(
  path: string,
  opts: { locationId: string; apiKey: string },
) => Promise<T>;

export interface EstimateFollowUpHandlerDeps {
  ghlPost?: GhlPostFn;
  ghlGet?: GhlGetFn;
  getActivationConfig?: (
    accountId: string,
    recipeSlug: string,
  ) => Promise<{ followUpMessage?: string; businessName?: string } | null>;
  getCallerContact?: (
    contactId: string,
    ctx: RecipeContext,
  ) => Promise<{ name: string; firstName?: string; phone?: string } | null>;
}

export interface EstimateFollowUpHandlerOptions {
  deps?: EstimateFollowUpHandlerDeps;
}

export function createEstimateFollowUpHandler(
  options: EstimateFollowUpHandlerOptions = {},
) {
  return async function estimateFollowUpHandler(
    ctx: RecipeContext,
    trigger: EstimateFollowUpTrigger,
  ): Promise<EstimateFollowUpResult> {
    const { opportunity_id, follow_up_attempt } = trigger.trigger_data;

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

    const { followUpMessage, businessName } = activationConfig;

    const opportunity = await fetchOpportunity(
      opportunity_id,
      ctx,
      options.deps?.ghlGet,
    );

    if (!opportunity) {
      return {
        outcome: "skipped_no_opportunity",
        smsBody: null,
        messageId: null,
        reason: "Opportunity not found",
      };
    }

    if (opportunity.status !== "open") {
      return {
        outcome: "skipped_not_open",
        smsBody: null,
        messageId: null,
        reason: `Opportunity status: ${opportunity.status}`,
      };
    }

    if (!opportunity.contact) {
      return {
        outcome: "skipped_no_opportunity",
        smsBody: null,
        messageId: null,
        reason: "No contact on opportunity",
      };
    }

    const contactName = opportunity.contact.name ||
      opportunity.contact.firstName || "Customer";

    const smsBody = await generateFollowUpMessage(
      ctx,
      contactName,
      followUpMessage,
      businessName,
      follow_up_attempt,
    );

    if (!smsBody) {
      return {
        outcome: "skipped_no_message",
        smsBody: null,
        messageId: null,
      };
    }

    if (!opportunity.contact.phone) {
      return {
        outcome: "skipped_no_message",
        smsBody: null,
        messageId: null,
        reason: "No phone on contact",
      };
    }

    const messageId = await sendSms(
      opportunity.contact.id,
      smsBody,
      ctx,
      options.deps?.ghlPost,
    );

    return {
      outcome: "estimate_follow_up_sent",
      smsBody,
      messageId,
    };
  };
}

interface GhlOpportunity {
  id: string;
  status: string;
  contact?: {
    id: string;
    name?: string | null;
    firstName?: string | null;
    phone?: string | null;
  };
}

async function loadActivationConfig(
  accountId: string,
  customLoader?: (
    accountId: string,
    recipeSlug: string,
  ) => Promise<{ followUpMessage?: string; businessName?: string } | null>,
): Promise<{ followUpMessage?: string; businessName?: string } | null> {
  if (customLoader) {
    return customLoader(accountId, "estimate-follow-up");
  }

  const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("recipe_activations")
    .select("config")
    .eq("account_id", accountId)
    .eq("recipe_slug", "estimate-follow-up")
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
    followUpMessage: typeof config.followUpMessage === "string"
      ? config.followUpMessage
      : undefined,
    businessName: typeof config.businessName === "string"
      ? config.businessName
      : undefined,
  };
}

async function fetchOpportunity(
  opportunityId: string,
  ctx: RecipeContext,
  ghlGet?: GhlGetFn,
): Promise<GhlOpportunity | null> {
  const get = ghlGet ?? (await import("@/lib/ghl/client")).ghlGet as GhlGetFn;

  try {
    const response = await get<GhlOpportunity>(
      `/opportunities/${opportunityId}`,
      {
        locationId: ctx.ghl.locationId,
        apiKey: ctx.ghl.accessToken,
      },
    );

    return response;
  } catch {
    return null;
  }
}

async function generateFollowUpMessage(
  ctx: RecipeContext,
  contactName: string,
  followUpMessage?: string,
  businessName?: string,
  followUpAttempt: number = 1,
): Promise<string | null> {
  const safeName = sanitizeForPrompt(contactName, { maxLen: 120 }) || "Customer";
  const safeBusiness = sanitizeForPrompt(businessName, { maxLen: 120 });
  const safeFollowUp = sanitizeForPrompt(followUpMessage, { maxLen: 500 });
  const tone = followUpAttempt === 1
    ? "friendly and warm"
    : "slightly more direct but still polite";

  const business = safeBusiness ? ` from ${safeBusiness}` : "";

  const userMessage = safeFollowUp
    ? `Write a ${tone} follow-up message${business} for ${safeName}. ` +
      `Include this: "${safeFollowUp}". Keep it under 300 characters.`
    : `Write a ${tone} follow-up message${business} for ${safeName} ` +
      `about their recent estimate. Keep it under 300 characters.`;

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