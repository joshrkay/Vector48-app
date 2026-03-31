// ---------------------------------------------------------------------------
// GHL Webhook Side Effects — Async post-processing after event is persisted.
// Checks active recipe activations and triggers recipe-specific reactions.
// Must never throw — all errors are caught and logged.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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

interface RecipeActivation {
  id: string;
  recipe_slug: string;
  status: string;
  config: Record<string, unknown> | null;
}

// ── Side-effect handlers per event type ───────────────────────────────────

async function handleMessageReceived(
  supabase: SupabaseClient,
  accountId: string,
  event: AutomationEventInsert,
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
  await supabase.from("automation_events").insert({
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
  supabase: SupabaseClient,
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
  await supabase.from("automation_events").insert({
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
  supabase: SupabaseClient,
  accountId: string,
  event: AutomationEventInsert,
  rawPayload: Record<string, unknown>
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

  // Require 2+ keyword matches to reduce false positives — a single
  // "cancel" in a normal appointment call shouldn't trigger an alert
  if (matchedKeywords.length < 2) return;

  // Flag call for review — this shows as an alert in the dashboard
  await supabase.from("automation_events").insert({
    account_id: accountId,
    recipe_slug: null,
    event_type: "alert",
    ghl_event_type: event.ghl_event_type,
    contact_id: event.contact_id,
    summary: `Flagged call: potential complaint from contact ${event.contact_id ?? "(unknown)"}`,
    detail: {
      reason: "negative_sentiment_detected",
      keywords: matchedKeywords,
      original_event_id: event.ghl_event_id,
    },
  });
}

// ── Main dispatcher ───────────────────────────────────────────────────────

/**
 * Process side effects after a webhook event has been written to automation_events.
 * This function is fire-and-forget — it must never throw.
 */
export async function processSideEffects(
  accountId: string,
  event: AutomationEventInsert,
  rawPayload: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();

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
        await handleMessageReceived(supabase, accountId, event, activeRecipes);
        break;
      case "appointment_updated":
        await handleAppointmentUpdated(supabase, accountId, event, rawPayload, activeRecipes);
        break;
      case "call_completed":
        await handleCallCompleted(supabase, accountId, event, rawPayload);
        break;
      // Other event types: no side effects yet.
      // Add new cases here as recipes are built.
    }
  } catch (err) {
    // Never throw from side effects — log and swallow
    console.error("[webhook-side-effects] Unhandled error:", err);
  }
}
