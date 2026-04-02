import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import type { AutomationEventInsert } from "./webhookTypes";

const NEGATIVE_KEYWORDS = ["frustrated", "angry", "terrible", "emergency"];

type ActiveRecipe = Pick<
  Database["public"]["Tables"]["recipe_activations"]["Row"],
  "id" | "recipe_slug" | "status"
>;

type PendingTrigger = Pick<
  Database["public"]["Tables"]["recipe_triggers"]["Row"],
  "id" | "recipe_slug" | "contact_id" | "payload"
>;

function contactIdFrom(
  event: AutomationEventInsert,
  rawPayload: Record<string, unknown>,
): string | null {
  if (event.contact_id) return event.contact_id;
  if (typeof rawPayload.contactId === "string") return rawPayload.contactId;
  if (typeof rawPayload.contact_id === "string") return rawPayload.contact_id;

  const contact =
    typeof rawPayload.contact === "object" && rawPayload.contact !== null
      ? (rawPayload.contact as Record<string, unknown>)
      : null;

  return typeof contact?.id === "string" ? contact.id : null;
}

async function getActiveRecipes(accountId: string): Promise<ActiveRecipe[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("recipe_activations")
    .select("id, recipe_slug, status")
    .eq("account_id", accountId)
    .eq("status", "active");

  if (error) {
    throw new Error(`failed to load active recipes: ${error.message}`);
  }

  return (data ?? []) as ActiveRecipe[];
}

async function getPendingTriggersForContact(
  accountId: string,
  contactId: string,
  activeRecipeSlugs: string[],
): Promise<PendingTrigger[]> {
  if (activeRecipeSlugs.length === 0) return [];

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("recipe_triggers")
    .select("id, recipe_slug, contact_id, payload")
    .eq("account_id", accountId)
    .eq("contact_id", contactId)
    .eq("fired", false)
    .in("recipe_slug", activeRecipeSlugs);

  if (error) {
    throw new Error(`failed to load pending triggers: ${error.message}`);
  }

  return (data ?? []) as PendingTrigger[];
}

async function pauseFollowupForHumanReply(
  accountId: string,
  event: AutomationEventInsert,
  rawPayload: Record<string, unknown>,
  recipes: ActiveRecipe[],
): Promise<void> {
  if (event.ghl_event_type !== "InboundMessage") return;

  const contactId = contactIdFrom(event, rawPayload);
  if (!contactId) return;

  const activeRecipeSlugs = recipes.map((recipe) => recipe.recipe_slug);
  const matchingTriggers = await getPendingTriggersForContact(
    accountId,
    contactId,
    activeRecipeSlugs,
  );

  if (matchingTriggers.length === 0) return;

  const triggerIds = matchingTriggers.map((trigger) => trigger.id);
  const triggerSlugs = Array.from(new Set(matchingTriggers.map((trigger) => trigger.recipe_slug)));
  const primaryRecipeSlug = triggerSlugs[0] ?? null;
  const supabase = getSupabaseAdmin();

  const { error: deleteError } = await supabase
    .from("recipe_triggers")
    .delete()
    .eq("account_id", accountId)
    .eq("contact_id", contactId)
    .eq("fired", false)
    .in("id", triggerIds);

  if (deleteError) {
    throw new Error(`failed to delete pending triggers: ${deleteError.message}`);
  }

  const { error: insertError } = await supabase.from("automation_events").insert({
    account_id: accountId,
    recipe_slug: primaryRecipeSlug,
    event_type: "sequence_paused",
    ghl_event_type: event.ghl_event_type,
    ghl_event_id: `${event.ghl_event_id ?? "no-event-id"}:sequence-paused`,
    contact_id: contactId,
    contact_phone: event.contact_phone,
    contact_name: event.contact_name,
    summary: `Follow-up sequence cleared for ${event.contact_name ?? event.contact_phone ?? "contact"} after reply`,
    detail: {
      reason: "human_reply",
      source_event_id: event.ghl_event_id,
      trigger_ids: triggerIds,
      recipe_slugs: triggerSlugs,
    },
  });

  if (insertError) {
    throw new Error(`failed to insert sequence pause event: ${insertError.message}`);
  }
}

async function triggerAppointmentRebooking(
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

  const rebookingRecipe = recipes.find(
    (recipe) => recipe.recipe_slug === "appointment-rebooking",
  );
  if (!rebookingRecipe) return;

  const contactId = contactIdFrom(event, rawPayload);
  const supabase = getSupabaseAdmin();

  const { error: triggerError } = await supabase.from("recipe_triggers").insert({
    account_id: accountId,
    recipe_slug: rebookingRecipe.recipe_slug,
    ghl_event_type: event.ghl_event_type,
    contact_id: contactId,
    fire_at: new Date().toISOString(),
    payload: {
      source_event_id: event.ghl_event_id,
      appointment_id:
        typeof rawPayload.appointmentId === "string"
          ? rawPayload.appointmentId
          : typeof rawPayload.appointment_id === "string"
            ? rawPayload.appointment_id
            : null,
      appointment_status: status,
    },
  });

  if (triggerError) {
    throw new Error(`failed to enqueue rebooking trigger: ${triggerError.message}`);
  }

  const { error: auditError } = await supabase.from("automation_events").insert({
    account_id: accountId,
    recipe_slug: rebookingRecipe.recipe_slug,
    event_type: "rebook_triggered",
    ghl_event_type: event.ghl_event_type,
    ghl_event_id: `${event.ghl_event_id ?? "no-event-id"}:rebook`,
    contact_id: contactId,
    contact_phone: event.contact_phone,
    contact_name: event.contact_name,
    summary: `Appointment cancelled for ${event.contact_name ?? event.contact_phone ?? "contact"} — re-booking flow started`,
    detail: {
      reason: "appointment_cancelled",
      source_event_id: event.ghl_event_id,
      recipe_activation_id: rebookingRecipe.id,
    },
  });

  if (auditError) {
    throw new Error(`failed to insert rebooking audit event: ${auditError.message}`);
  }
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
  const { error } = await supabase.from("automation_events").insert({
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
      resolved: false,
    },
  });

  if (error) {
    throw new Error(`failed to insert alert event: ${error.message}`);
  }
}

async function runSideEffect(
  label: string,
  task: () => Promise<void>,
): Promise<void> {
  try {
    await task();
  } catch (error) {
    console.error(`[ghl-webhook] ${label} failed`, error);
  }
}

export async function processSideEffects(
  accountId: string,
  event: AutomationEventInsert,
  rawPayload: Record<string, unknown>,
): Promise<void> {
  let activeRecipes: ActiveRecipe[] = [];

  try {
    activeRecipes = await getActiveRecipes(accountId);
  } catch (error) {
    console.error("[ghl-webhook] failed to load active recipes", error);
    return;
  }

  await Promise.allSettled([
    runSideEffect("pause follow-up", () =>
      pauseFollowupForHumanReply(accountId, event, rawPayload, activeRecipes),
    ),
    runSideEffect("appointment rebooking", () =>
      triggerAppointmentRebooking(accountId, event, rawPayload, activeRecipes),
    ),
    runSideEffect("negative call alert", () =>
      flagNegativeCalls(accountId, event, rawPayload),
    ),
  ]);
}
