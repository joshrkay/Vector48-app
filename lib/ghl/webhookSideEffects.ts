// ---------------------------------------------------------------------------
// GHL Webhook Side Effects — Async post-processing after event is persisted.
// Checks active recipe activations and triggers recipe-specific reactions.
// Must never throw — all errors are caught and logged.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AutomationEventInsert } from "./webhookTypes";
import {
  GHL_EVENT_TO_RECIPES,
  INBOUND_RECIPES,
  SCHEDULED_RECIPE_OFFSETS,
  getN8nWebhookUrl,
} from "@/lib/recipes/eventMapping";

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
  await supabase.from("event_log").insert({
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

// ── Recipe-aware event routing ──────────────────────────────────────────

/**
 * Route GHL events to recipes. For inbound recipes (Pattern A), fire directly
 * to n8n. For scheduled recipes (Pattern B), insert into recipe_triggers.
 */
async function routeEventToRecipes(
  supabase: SupabaseClient,
  accountId: string,
  ghlEventType: string,
  rawPayload: Record<string, unknown>,
  activeRecipes: RecipeActivation[],
): Promise<void> {
  const recipeSlugs = GHL_EVENT_TO_RECIPES[ghlEventType];
  if (!recipeSlugs?.length) return;

  for (const slug of recipeSlugs) {
    const activation = activeRecipes.find((r) => r.recipe_slug === slug);
    if (!activation) continue;

    if (INBOUND_RECIPES.has(slug)) {
      // Pattern A: Fire directly to n8n webhook
      await fireInboundRecipe(accountId, slug, rawPayload);
    } else {
      // Pattern B: Write scheduled trigger(s)
      await writeScheduledTriggers(
        supabase,
        accountId,
        slug,
        ghlEventType,
        rawPayload,
      );
    }
  }
}

/** Pattern A: POST event data to n8n immediately. */
async function fireInboundRecipe(
  accountId: string,
  recipeSlug: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = getN8nWebhookUrl(recipeSlug, accountId);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId, ...payload }),
    });
  } catch (err) {
    console.error(
      `[webhook-side-effects] Failed to fire inbound recipe ${recipeSlug}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/** Pattern B: Insert recipe_triggers rows with appropriate fire_at times. */
async function writeScheduledTriggers(
  supabase: SupabaseClient,
  accountId: string,
  recipeSlug: string,
  ghlEventType: string,
  rawPayload: Record<string, unknown>,
): Promise<void> {
  const offsets = SCHEDULED_RECIPE_OFFSETS[recipeSlug];
  if (!offsets?.length) return;

  const contactId =
    typeof rawPayload.contactId === "string" ? rawPayload.contactId :
    typeof rawPayload.contact_id === "string" ? rawPayload.contact_id :
    null;

  const rows = offsets.map((offset) => {
    let fireAt: Date;

    if (offset.offsetMinutes < 0) {
      // Negative offset = before an event timestamp (e.g. appointment reminders)
      const appointmentTime =
        typeof rawPayload.startTime === "string"
          ? new Date(rawPayload.startTime)
          : typeof rawPayload.start_time === "string"
            ? new Date(rawPayload.start_time)
            : new Date();
      fireAt = new Date(appointmentTime.getTime() + offset.offsetMinutes * 60_000);
    } else {
      // Positive offset = after now
      fireAt = new Date(Date.now() + offset.offsetMinutes * 60_000);
    }

    // Don't schedule triggers in the past
    if (fireAt.getTime() < Date.now()) return null;

    return {
      account_id: accountId,
      recipe_slug: recipeSlug,
      ghl_event_type: ghlEventType,
      contact_id: contactId,
      fire_at: fireAt.toISOString(),
      payload: rawPayload,
    };
  }).filter(Boolean);

  if (rows.length > 0) {
    const { error } = await supabase
      .from("recipe_triggers")
      .insert(rows);

    if (error) {
      console.error(
        `[webhook-side-effects] Failed to insert recipe_triggers for ${recipeSlug}:`,
        error.message,
      );
    }
  }
}

// ── Missed call detection ──────────────────────────────────────────────

async function handleCallStatusUpdate(
  supabase: SupabaseClient,
  accountId: string,
  event: AutomationEventInsert,
  rawPayload: Record<string, unknown>,
  activeRecipes: RecipeActivation[],
): Promise<void> {
  const callStatus =
    typeof rawPayload.status === "string" ? rawPayload.status.toLowerCase() : "";
  const duration =
    typeof rawPayload.duration === "number" ? rawPayload.duration : -1;

  const isMissed = callStatus === "missed" || callStatus === "no-answer" || duration === 0;
  if (!isMissed) return;

  // Route to missed-call-text-back and other matching recipes
  await routeEventToRecipes(supabase, accountId, "CallStatusUpdate", rawPayload, activeRecipes);
}

// ── Appointment scheduling (reminders) ────────────────────────────────

async function handleAppointmentCreated(
  supabase: SupabaseClient,
  accountId: string,
  rawPayload: Record<string, unknown>,
  activeRecipes: RecipeActivation[],
): Promise<void> {
  await routeEventToRecipes(supabase, accountId, "AppointmentCreate", rawPayload, activeRecipes);
}

// ── Opportunity events (estimate follow-up, review request) ───────────

async function handleOpportunityCreated(
  supabase: SupabaseClient,
  accountId: string,
  rawPayload: Record<string, unknown>,
  activeRecipes: RecipeActivation[],
): Promise<void> {
  await routeEventToRecipes(supabase, accountId, "OpportunityCreate", rawPayload, activeRecipes);
}

async function handleOpportunityStatusUpdate(
  supabase: SupabaseClient,
  accountId: string,
  rawPayload: Record<string, unknown>,
  activeRecipes: RecipeActivation[],
): Promise<void> {
  const status =
    typeof rawPayload.status === "string" ? rawPayload.status.toLowerCase() : "";

  // Review Request recipe fires only on "won" status
  if (status !== "won") return;

  await routeEventToRecipes(supabase, accountId, "OpportunityStatusUpdate", rawPayload, activeRecipes);
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
    }

    // Route GHL-native event types to recipes (Pattern A + B)
    const ghlEventType = event.ghl_event_type;
    if (ghlEventType) {
      switch (ghlEventType) {
        case "CallStatusUpdate":
          await handleCallStatusUpdate(supabase, accountId, event, rawPayload, activeRecipes);
          break;
        case "AppointmentCreate":
        case "AppointmentUpdate":
          await handleAppointmentCreated(supabase, accountId, rawPayload, activeRecipes);
          break;
        case "OpportunityCreate":
          await handleOpportunityCreated(supabase, accountId, rawPayload, activeRecipes);
          break;
        case "OpportunityStatusUpdate":
          await handleOpportunityStatusUpdate(supabase, accountId, rawPayload, activeRecipes);
          break;
      }
    }
  } catch (err) {
    // Never throw from side effects — log and swallow
    console.error("[webhook-side-effects] Unhandled error:", err);
  }
}
