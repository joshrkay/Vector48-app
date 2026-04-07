import "server-only";

// ---------------------------------------------------------------------------
// GHL-Native Recipe Executor
// Executes recipes directly via the GHL API (SMS) without n8n.
// ---------------------------------------------------------------------------

import { getAccountGhlCredentials } from "@/lib/ghl";
import {
  createConversation,
  getConversations,
  sendMessage,
} from "@/lib/ghl/conversations";
import {
  resolveMessageTemplate,
  interpolateMessage,
  type MergeFields,
} from "@/lib/recipes/messageTemplate";
import { createAdminClient } from "@/lib/supabase/admin";

// Re-export pure functions for convenience
export { resolveMessageTemplate, interpolateMessage, type MergeFields } from "@/lib/recipes/messageTemplate";

// ---------------------------------------------------------------------------
// SMS execution
// ---------------------------------------------------------------------------

export interface GhlExecutionParams {
  accountId: string;
  recipeSlug: string;
  contactId: string;
  triggerData: Record<string, unknown>;
}

export interface GhlExecutionResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Execute a GHL-native recipe: resolve the message, send it via GHL SMS,
 * and log the event to automation_events.
 */
export async function executeGhlNativeRecipe(
  params: GhlExecutionParams,
): Promise<GhlExecutionResult> {
  const { accountId, recipeSlug, contactId, triggerData } = params;

  // 1. Fetch account info for merge fields and vertical
  const supabase = createAdminClient();
  const { data: account } = await supabase
    .from("accounts")
    .select("business_name, vertical, phone")
    .eq("id", accountId)
    .single();

  if (!account) {
    return { ok: false, error: "Account not found" };
  }

  // 2. Load activation config
  const { data: activation } = await supabase
    .from("recipe_activations")
    .select("config")
    .eq("account_id", accountId)
    .eq("recipe_slug", recipeSlug)
    .eq("status", "active")
    .single();

  const config = (activation?.config as Record<string, unknown>) ?? {};

  // 3. Resolve the message template
  const template = resolveMessageTemplate(recipeSlug, account.vertical, config);
  if (!template) {
    return { ok: false, error: `No message template for recipe ${recipeSlug}` };
  }

  // 4. Build merge fields from trigger data + account info
  const mergeFields: MergeFields = {
    business_name: account.business_name ?? "",
    contact_name: (triggerData.contact_name as string) ?? (triggerData.contactName as string) ?? "",
    appointment_time: (triggerData.appointment_time as string) ?? "",
    tech_name: (triggerData.tech_name as string) ?? "",
    eta: (triggerData.eta as string) ?? "",
    review_link: (config.reviewLink as string) ?? (triggerData.review_link as string) ?? "",
    weather_event: (config.weatherEventType as string) ?? (triggerData.weather_event as string) ?? "",
  };

  const message = interpolateMessage(template, mergeFields);
  if (!message.trim()) {
    return { ok: false, error: "Interpolated message is empty" };
  }

  // 5. Send SMS via GHL
  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(accountId);
    const opts = { locationId, apiKey: accessToken };

    // Find or create conversation
    const convResult = await getConversations({ contactId }, opts);
    const existing = convResult.conversations ?? [];

    let conversationId: string;
    if (existing.length > 0) {
      conversationId = existing[0].id;
    } else {
      const created = await createConversation({ contactId, locationId }, opts);
      conversationId = created.conversation.id;
    }

    const msg = await sendMessage(
      conversationId,
      { type: "TYPE_SMS", contactId, message },
      opts,
    );

    // 6. Log to automation_events
    await supabase.from("automation_events").insert({
      account_id: accountId,
      recipe_slug: recipeSlug,
      event_type: "sms_sent",
      contact_id: contactId,
      summary: `Sent ${recipeSlug} SMS to contact`,
      detail: { messageId: msg.id, conversationId, message },
    });

    return { ok: true, messageId: msg.id };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Log failure (ignore logging errors)
    try {
      await supabase.from("automation_events").insert({
        account_id: accountId,
        recipe_slug: recipeSlug,
        event_type: "sms_failed",
        contact_id: contactId,
        summary: `Failed to send ${recipeSlug} SMS`,
        detail: { error: errorMsg },
      });
    } catch {
      // Don't fail on logging failure
    }

    return { ok: false, error: errorMsg };
  }
}
