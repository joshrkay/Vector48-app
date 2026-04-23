// ---------------------------------------------------------------------------
// Shared helper: generic SMS recipe handler factory.
//
// Many recipes follow the same shape: load activation config → fetch contact
// → generate a short SMS via Claude → send via GHL → return result. This
// module hosts a single factory so thin per-recipe handler files stay under
// ~60 lines and share a single audited outbound path.
//
// Per-recipe handlers customize via PromptBuilder (turns trigger + contact +
// config into the Claude user message) and OutcomeTag (the result string
// when the SMS lands successfully).
// ---------------------------------------------------------------------------

import type { Message } from "@anthropic-ai/sdk/resources/messages";
import type { RecipeContext } from "../context.ts";

export type GhlPostFn = <T>(
  path: string,
  body: unknown,
  opts: { locationId: string; apiKey: string },
) => Promise<T>;

export interface CallerContact {
  name: string;
  firstName?: string;
  phone?: string;
}

export interface SharedSmsTrigger {
  account_id: string;
  trigger_data: {
    contact_id: string;
    [key: string]: unknown;
  };
}

export interface SmsRecipeResult<TOutcome extends string = string> {
  outcome: TOutcome | "skipped_no_activation_config" | "skipped_no_contact" | "skipped_no_message";
  smsBody: string | null;
  messageId: string | null;
  reason?: string;
}

export interface SmsHandlerOptions<TConfig extends Record<string, unknown>> {
  recipeSlug: string;
  successOutcome: string;
  maxSmsChars?: number;
  buildPrompt: (input: {
    contact: CallerContact;
    config: TConfig;
    trigger: SharedSmsTrigger;
    ctx: RecipeContext;
  }) => string;
  deps?: {
    ghlPost?: GhlPostFn;
    getActivationConfig?: (
      accountId: string,
      recipeSlug: string,
    ) => Promise<TConfig | null>;
    getCallerContact?: (
      contactId: string,
      ctx: RecipeContext,
    ) => Promise<CallerContact | null>;
  };
}

export function createSmsRecipeHandler<TConfig extends Record<string, unknown>>(
  options: SmsHandlerOptions<TConfig>,
) {
  const maxChars = options.maxSmsChars ?? 300;

  return async function smsRecipeHandler(
    ctx: RecipeContext,
    trigger: SharedSmsTrigger,
  ): Promise<SmsRecipeResult> {
    const contactId = trigger.trigger_data.contact_id;

    const config = await (options.deps?.getActivationConfig ?? loadActivationConfig)(
      trigger.account_id,
      options.recipeSlug,
    );

    if (!config) {
      return {
        outcome: "skipped_no_activation_config",
        smsBody: null,
        messageId: null,
      };
    }

    const contact = await (options.deps?.getCallerContact ?? fetchCallerContact)(
      contactId,
      ctx,
    );

    if (!contact) {
      return {
        outcome: "skipped_no_contact",
        smsBody: null,
        messageId: null,
      };
    }

    const userMessage = options.buildPrompt({
      contact,
      config: config as TConfig,
      trigger,
      ctx,
    });

    const smsBody = await generateSms(ctx, userMessage, maxChars);

    if (!smsBody) {
      return {
        outcome: "skipped_no_message",
        smsBody: null,
        messageId: null,
      };
    }

    if (!contact.phone) {
      return {
        outcome: "skipped_no_message",
        smsBody,
        messageId: null,
        reason: "No phone on contact",
      };
    }

    const messageId = await sendSms(contactId, smsBody, ctx, options.deps?.ghlPost);

    if (!messageId) {
      // sendSms returns null on GHL delivery failure — callers were
      // previously seeing options.successOutcome with messageId=null, which
      // is misleading. Surface the failure through the existing
      // skipped_no_message outcome so dashboards and retries behave correctly.
      return {
        outcome: "skipped_no_message",
        smsBody,
        messageId: null,
        reason: "GHL message delivery failed",
      };
    }

    return {
      outcome: options.successOutcome,
      smsBody,
      messageId,
    };
  };
}

async function loadActivationConfig<T extends Record<string, unknown>>(
  accountId: string,
  recipeSlug: string,
): Promise<T | null> {
  const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("recipe_activations")
    .select("config")
    .eq("account_id", accountId)
    .eq("recipe_slug", recipeSlug)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const config = data.config as T | null;
  return config ?? null;
}

async function fetchCallerContact(
  contactId: string,
  ctx: RecipeContext,
): Promise<CallerContact | null> {
  try {
    const { getContact } = await import("@/lib/ghl/contacts");
    const response = await getContact(contactId, {
      locationId: ctx.ghl.locationId,
      apiKey: ctx.ghl.accessToken,
    });

    const c = response?.contact;
    if (!c) return null;

    return {
      name: c.name ?? c.firstName ?? "Customer",
      firstName: c.firstName ?? undefined,
      phone: c.phone ?? undefined,
    };
  } catch (error) {
    console.error(
      `[sms-recipe] failed to fetch contact ${contactId}`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function generateSms(
  ctx: RecipeContext,
  userMessage: string,
  maxChars: number,
): Promise<string | null> {
  const response: Message = await ctx.ai.messages.create({
    model: ctx.agent.model,
    max_tokens: ctx.agent.max_tokens,
    ...(ctx.agent.temperature != null
      ? { temperature: ctx.agent.temperature }
      : {}),
    system: ctx.agent.system_prompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const parts: string[] = [];
  for (const block of response.content) {
    if (block.type === "text") parts.push(block.text);
  }
  const text = parts.join("\n").trim();

  if (!text) return null;
  if (text.length > maxChars) {
    // Claude occasionally overruns the prompt-stated max. Log and truncate so a
    // runaway response can't push SMS costs up, but surface it loudly so ops
    // can spot recipes that need prompt tuning.
    console.warn(
      `[sms-recipe] generated SMS exceeded ${maxChars} chars (was ${text.length}); truncating`,
    );
    return text.slice(0, maxChars - 3) + "...";
  }
  return text;
}

async function sendSms(
  contactId: string,
  message: string,
  ctx: RecipeContext,
  customPost?: GhlPostFn,
): Promise<string | null> {
  const post =
    customPost ?? ((await import("@/lib/ghl/client")).ghlPost as GhlPostFn);

  try {
    const response = await post<{ messageId?: string; id?: string }>(
      "/conversations/messages",
      { type: "SMS", contactId, message },
      { locationId: ctx.ghl.locationId, apiKey: ctx.ghl.accessToken },
    );
    return response.messageId ?? response.id ?? null;
  } catch {
    return null;
  }
}
