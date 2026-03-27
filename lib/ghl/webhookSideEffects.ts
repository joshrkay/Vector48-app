// ---------------------------------------------------------------------------
// GHL Webhook Side Effects — Async post-processing after event is persisted.
// Checks active recipe activations and triggers recipe-specific reactions.
// Must never throw — all errors are caught and logged.
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import type { AutomationEventInsert } from "./webhookTypes";

// Negative sentiment keywords that flag a call for review
const NEGATIVE_SENTIMENT_KEYWORDS = [
  "complaint",
  "cancel",
  "unhappy",
  "refund",
  "terrible",
  "worst",
  "lawsuit",
  "angry",
  "frustrated",
  "disappointed",
];

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface RecipeActivation {
  id: string;
  recipe_slug: string;
  status: string;
  config: Record<string, unknown> | null;
}

// ── Side-effect handlers per event type ───────────────────────────────────

async function handleMessageReceived(
  accountId: string,
  event: AutomationEventInsert,
  _rawPayload: Record<string, unknown>,
  activeRecipes: RecipeActivation[]
): Promise<void> {
  // Check for active follow-up or nurture recipes
  const followUpRecipe = activeRecipes.find(
    (r) =>
      r.recipe_slug.includes("follow-up") ||
      r.recipe_slug.includes("nurture") ||
      r.recipe_slug.includes("followup")
  );

  if (!followUpRecipe) return;

  // A human replied — log that we detected it for the follow-up sequence.
  // Future: pause the n8n workflow via API using followUpRecipe.n8n_workflow_id
  const supabase = getAdminClient();
  await supabase.from("event_log").insert({
    account_id: accountId,
    recipe_slug: followUpRecipe.recipe_slug,
    event_type: "sequence_paused",
    ghl_event_type: event.ghl_event_type,
    contact_id: event.contact_id,
    summary: `Follow-up paused: ${event.contact_id ? "contact" : "someone"} replied`,
    detail: {
      reason: "human_reply_detected",
      original_event_id: event.ghl_event_id,
      recipe_activation_id: followUpRecipe.id,
    },
  });
}

async function handleAppointmentUpdated(
  accountId: string,
  event: AutomationEventInsert,
  rawPayload: Record<string, unknown>,
  activeRecipes: RecipeActivation[]
): Promise<void> {
  const status =
    typeof rawPayload.status === "string"
      ? rawPayload.status.toLowerCase()
      : typeof rawPayload.appointmentStatus === "string"
        ? rawPayload.appointmentStatus.toLowerCase()
        : null;

  if (status !== "cancelled") return;

  // Check for active re-booking recipe
  const rebookRecipe = activeRecipes.find(
    (r) =>
      r.recipe_slug.includes("rebook") ||
      r.recipe_slug.includes("re-book") ||
      r.recipe_slug.includes("reschedule")
  );

  if (!rebookRecipe) return;

  // Future: invoke n8n re-booking workflow
  const supabase = getAdminClient();
  await supabase.from("event_log").insert({
    account_id: accountId,
    recipe_slug: rebookRecipe.recipe_slug,
    event_type: "rebook_triggered",
    ghl_event_type: event.ghl_event_type,
    contact_id: event.contact_id,
    summary: `Re-booking triggered: appointment cancelled`,
    detail: {
      reason: "appointment_cancelled",
      original_event_id: event.ghl_event_id,
      recipe_activation_id: rebookRecipe.id,
    },
  });
}

async function handleCallCompleted(
  accountId: string,
  event: AutomationEventInsert,
  rawPayload: Record<string, unknown>,
  _activeRecipes: RecipeActivation[]
): Promise<void> {
  // Check notes and transcription for negative sentiment
  const notes =
    typeof rawPayload.notes === "string" ? rawPayload.notes.toLowerCase() : "";
  const transcription =
    typeof rawPayload.transcription === "string"
      ? rawPayload.transcription.toLowerCase()
      : "";
  const searchText = `${notes} ${transcription}`;

  const matchedKeywords = NEGATIVE_SENTIMENT_KEYWORDS.filter((kw) =>
    searchText.includes(kw)
  );

  if (matchedKeywords.length === 0) return;

  // Flag call for review — this shows as an alert in the dashboard
  const supabase = getAdminClient();
  await supabase.from("event_log").insert({
    account_id: accountId,
    recipe_slug: null,
    event_type: "alert",
    ghl_event_type: event.ghl_event_type,
    contact_id: event.contact_id,
    summary: `Flagged call: potential complaint from ${event.summary.split("with ")[1]?.split(" —")[0] ?? "contact"}`,
    detail: {
      reason: "negative_sentiment_detected",
      keywords: matchedKeywords,
      original_event_id: event.ghl_event_id,
    },
  });
}

// ── Main dispatcher ───────────────────────────────────────────────────────

/**
 * Process side effects after a webhook event has been written to event_log.
 * This function is fire-and-forget — it must never throw.
 */
export async function processSideEffects(
  accountId: string,
  event: AutomationEventInsert,
  rawPayload: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = getAdminClient();

    // Fetch active recipe activations for this account
    const { data: recipes, error } = await supabase
      .from("recipe_activations")
      .select("id, recipe_slug, status, config")
      .eq("account_id", accountId)
      .eq("status", "active");

    if (error) {
      console.error("[webhook-side-effects] Failed to fetch recipes:", error.message);
      return;
    }

    const activeRecipes = (recipes ?? []) as RecipeActivation[];

    // Dispatch to event-specific handlers
    switch (event.event_type) {
      case "message_received":
        await handleMessageReceived(accountId, event, rawPayload, activeRecipes);
        break;
      case "appointment_updated":
        await handleAppointmentUpdated(accountId, event, rawPayload, activeRecipes);
        break;
      case "call_completed":
        await handleCallCompleted(accountId, event, rawPayload, activeRecipes);
        break;
      // Other event types: no side effects yet.
      // Add new cases here as recipes are built.
    }
  } catch (err) {
    // Never throw from side effects — log and swallow
    console.error("[webhook-side-effects] Unhandled error:", err);
  }
}
