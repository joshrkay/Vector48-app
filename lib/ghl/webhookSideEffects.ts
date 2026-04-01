import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AutomationEventInsert } from "./webhookTypes";

const NEGATIVE_KEYWORDS = ["frustrated", "angry", "terrible", "emergency"];

interface ActiveRecipe {
  id: string;
  recipe_slug: string;
  status: "active" | "paused" | "error" | "deactivated";
}

function contactIdFrom(event: AutomationEventInsert, rawPayload: Record<string, unknown>): string | null {
  if (event.contact_id) return event.contact_id;
  if (typeof rawPayload.contactId === "string") return rawPayload.contactId;
  if (typeof rawPayload.contact_id === "string") return rawPayload.contact_id;
  return null;
}

async function getActiveRecipes(accountId: string): Promise<ActiveRecipe[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("recipe_activations")
    .select("id, recipe_slug, status")
    .eq("account_id", accountId)
    .eq("status", "active");

  if (error) {
    console.error("[ghl-webhook] failed to load active recipes", error.message);
    return [];
  }

  return (data ?? []) as ActiveRecipe[];
}

async function isInActiveSequence(accountId: string, contactId: string | null): Promise<boolean> {
  if (!contactId) return false;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("recipe_triggers")
    .select("id")
    .eq("account_id", accountId)
    .eq("contact_id", contactId)
    .limit(1);

  if (error) {
    console.error("[ghl-webhook] failed to lookup active sequence", error.message);
    return false;
  }

  return Boolean(data && data.length > 0);
}

async function pauseFollowupForHumanReply(
  accountId: string,
  event: AutomationEventInsert,
  rawPayload: Record<string, unknown>,
  recipes: ActiveRecipe[],
): Promise<void> {
  if (event.ghl_event_type !== "InboundMessage") return;

  const followUpRecipe = recipes.find((recipe) => recipe.recipe_slug.includes("follow-up"));
  if (!followUpRecipe) return;

  const contactId = contactIdFrom(event, rawPayload);
  const active = await isInActiveSequence(accountId, contactId);
  if (!active) return;

  const supabase = getSupabaseAdmin();
  await supabase
    .from("automation_events")
    .insert({
      account_id: accountId,
      recipe_slug: followUpRecipe.recipe_slug,
      event_type: "sequence_paused",
      ghl_event_type: event.ghl_event_type,
      ghl_event_id: `${event.ghl_event_id ?? "no-event-id"}:sequence-paused`,
      contact_id: contactId,
      contact_phone: event.contact_phone,
      contact_name: event.contact_name,
      summary: `Follow-up paused for ${event.contact_name ?? event.contact_phone ?? "contact"} after reply`,
      detail: {
        reason: "human_reply",
        source_event_id: event.ghl_event_id,
        recipe_activation_id: followUpRecipe.id,
      },
    })
    .select("id")
    .maybeSingle();
}

async function triggerRecipe7Rebook(
  accountId: string,
  event: AutomationEventInsert,
  rawPayload: Record<string, unknown>,
  recipes: ActiveRecipe[],
): Promise<void> {
  if (event.ghl_event_type !== "AppointmentStatusUpdate") return;

  const status =
    typeof rawPayload.status === "string"
      ? rawPayload.status.toLowerCase()
      : typeof rawPayload.appointmentStatus === "string"
        ? rawPayload.appointmentStatus.toLowerCase()
        : "";

  if (status !== "cancelled") return;

  const recipe7 = recipes.find((recipe) => recipe.recipe_slug === "appointment-rebooking");
  if (!recipe7) return;

  const supabase = getSupabaseAdmin();
  await supabase.from("automation_events").insert({
    account_id: accountId,
    recipe_slug: recipe7.recipe_slug,
    event_type: "rebook_triggered",
    ghl_event_type: event.ghl_event_type,
    ghl_event_id: `${event.ghl_event_id ?? "no-event-id"}:rebook`,
    contact_id: contactIdFrom(event, rawPayload),
    contact_phone: event.contact_phone,
    contact_name: event.contact_name,
    summary: `Appointment cancelled for ${event.contact_name ?? "contact"} — re-booking flow started`,
    detail: {
      reason: "appointment_cancelled",
      source_event_id: event.ghl_event_id,
      recipe_activation_id: recipe7.id,
    },
  });
}

async function flagNegativeCalls(
  accountId: string,
  event: AutomationEventInsert,
  rawPayload: Record<string, unknown>,
): Promise<void> {
  if (event.ghl_event_type !== "CallCompleted") return;

  const notes = typeof rawPayload.notes === "string" ? rawPayload.notes.toLowerCase() : "";
  const transcription =
    typeof rawPayload.transcription === "string" ? rawPayload.transcription.toLowerCase() : "";
  const haystack = `${notes} ${transcription}`;

  const found = NEGATIVE_KEYWORDS.filter((keyword) => haystack.includes(keyword));
  if (found.length === 0) return;

  const supabase = getSupabaseAdmin();
  await supabase.from("automation_events").insert({
    account_id: accountId,
    recipe_slug: null,
    event_type: "alert",
    ghl_event_type: event.ghl_event_type,
    ghl_event_id: `${event.ghl_event_id ?? "no-event-id"}:alert`,
    contact_id: event.contact_id,
    contact_phone: event.contact_phone,
    contact_name: event.contact_name,
    summary: `Call needs attention: ${event.contact_name ?? event.contact_phone ?? "customer"}`,
    detail: {
      reason: "negative_sentiment_keywords",
      keywords: found,
      source_event_id: event.ghl_event_id,
    },
  });
}

export async function processSideEffects(
  accountId: string,
  event: AutomationEventInsert,
  rawPayload: Record<string, unknown>,
): Promise<void> {
  try {
    const activeRecipes = await getActiveRecipes(accountId);
    await Promise.allSettled([
      pauseFollowupForHumanReply(accountId, event, rawPayload, activeRecipes),
      triggerRecipe7Rebook(accountId, event, rawPayload, activeRecipes),
      flagNegativeCalls(accountId, event, rawPayload),
    ]);
  } catch (error) {
    console.error("[ghl-webhook] side effects failed", error);
  }
}
