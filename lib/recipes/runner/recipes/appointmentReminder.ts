// ---------------------------------------------------------------------------
// Recipe Handler: Appointment Reminder
//
// Sends appointment reminder SMS before a scheduled appointment.
// Supports 24h and 2h reminder types.
//
// Flow:
//   1. Extract trigger fields (account_id, appointment_id, reminder_type)
//   2. Load activation config → get reminder templates
//   3. Fetch appointment from GHL
//   4. If cancelled → skip with reason
//   5. Generate reminder SMS using AI
//   6. Send SMS via GHL
//   7. Return result
// ---------------------------------------------------------------------------

import type { Message } from "@anthropic-ai/sdk/resources/messages";

import type { RecipeContext } from "../context.ts";
import { sanitizeForPrompt } from "../promptSanitize.ts";

export interface AppointmentReminderTrigger {
  account_id: string;
  trigger_data: {
    appointment_id: string;
    reminder_type: "24h" | "2h";
  };
}

export type AppointmentReminderOutcome =
  | "reminder_sent"
  | "skipped_cancelled"
  | "skipped_no_activation_config"
  | "skipped_no_appointment"
  | "skipped_no_message";

export interface AppointmentReminderResult {
  outcome: AppointmentReminderOutcome;
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

export interface AppointmentReminderHandlerDeps {
  ghlPost?: GhlPostFn;
  ghlGet?: GhlGetFn;
  getActivationConfig?: (
    accountId: string,
    recipeSlug: string,
  ) => Promise<{
    reminder24h?: string;
    reminder2h?: string;
    businessName?: string;
  } | null>;
  getCallerContact?: (
    contactId: string,
    ctx: RecipeContext,
  ) => Promise<{ name: string; firstName?: string; phone?: string } | null>;
}

export interface AppointmentReminderHandlerOptions {
  deps?: AppointmentReminderHandlerDeps;
}

export function createAppointmentReminderHandler(
  options: AppointmentReminderHandlerOptions = {},
) {
  return async function appointmentReminderHandler(
    ctx: RecipeContext,
    trigger: AppointmentReminderTrigger,
  ): Promise<AppointmentReminderResult> {
    const { appointment_id, reminder_type } = trigger.trigger_data;

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

    const appointment = await fetchAppointment(
      appointment_id,
      ctx,
      options.deps?.ghlGet,
    );

    if (!appointment) {
      return {
        outcome: "skipped_no_appointment",
        smsBody: null,
        messageId: null,
        reason: "Appointment not found",
      };
    }

    if (appointment.status === "cancelled") {
      return {
        outcome: "skipped_cancelled",
        smsBody: null,
        messageId: null,
        reason: "Appointment is cancelled",
      };
    }

    if (!appointment.contact) {
      return {
        outcome: "skipped_no_appointment",
        smsBody: null,
        messageId: null,
        reason: "No contact on appointment",
      };
    }

    const rawContactName = appointment.contact.name ??
      appointment.contact.firstName ?? "Customer";
    const contactName =
      sanitizeForPrompt(rawContactName, { maxLen: 120 }) || "Customer";

    const template = sanitizeForPrompt(
      reminder_type === "24h"
        ? activationConfig.reminder24h
        : activationConfig.reminder2h,
      { maxLen: 500 },
    );

    const businessName = sanitizeForPrompt(activationConfig.businessName, {
      maxLen: 120,
    });

    const smsBody = await generateReminderMessage(
      ctx,
      contactName,
      reminder_type,
      template,
      businessName,
      appointment.startTime,
    );

    if (!smsBody) {
      return {
        outcome: "skipped_no_message",
        smsBody: null,
        messageId: null,
      };
    }

    if (!appointment.contact.phone) {
      return {
        outcome: "skipped_no_message",
        smsBody: null,
        messageId: null,
        reason: "No phone on contact",
      };
    }

    const messageId = await sendSms(
      appointment.contact.id,
      smsBody,
      ctx,
      options.deps?.ghlPost,
    );

    return {
      outcome: "reminder_sent",
      smsBody,
      messageId,
    };
  };
}

interface GhlAppointment {
  id: string;
  status: string;
  startTime: string;
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
  ) => Promise<{
    reminder24h?: string;
    reminder2h?: string;
    businessName?: string;
  } | null>,
): Promise<{
  reminder24h?: string;
  reminder2h?: string;
  businessName?: string;
} | null> {
  if (customLoader) {
    return customLoader(accountId, "appointment-reminder");
  }

  const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("recipe_activations")
    .select("config")
    .eq("account_id", accountId)
    .eq("recipe_slug", "appointment-reminder")
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
    reminder24h: typeof config.reminder24h === "string" ? config.reminder24h : undefined,
    reminder2h: typeof config.reminder2h === "string" ? config.reminder2h : undefined,
    businessName: typeof config.businessName === "string"
      ? config.businessName
      : undefined,
  };
}

async function fetchAppointment(
  appointmentId: string,
  ctx: RecipeContext,
  ghlGet?: GhlGetFn,
): Promise<GhlAppointment | null> {
  const get = ghlGet ?? (await import("@/lib/ghl/client")).ghlGet as GhlGetFn;

  try {
    const response = await get<GhlAppointment>(
      `/calendars/events/appointments/${appointmentId}`,
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

async function generateReminderMessage(
  ctx: RecipeContext,
  contactName: string,
  reminderType: "24h" | "2h",
  template?: string,
  businessName?: string,
  appointmentTime?: string,
): Promise<string | null> {
  const typeLabel = reminderType === "24h" ? "tomorrow" : "in 2 hours";
  const business = businessName ? ` from ${businessName}` : "";

  const userMessage = template
    ? `Write a friendly appointment reminder${business} for ${contactName}. ` +
      `The reminder is ${typeLabel}. Include this: "${template}". ` +
      "Keep it under 300 characters, warm and helpful."
    : `Write a friendly appointment reminder${business} for ${contactName}. ` +
      `The reminder is ${typeLabel}. ` +
      "Ask them to confirm or let us know if they need to reschedule. " +
      "Keep it under 300 characters, warm and helpful.";

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