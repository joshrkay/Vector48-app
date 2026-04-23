import {
  CALLBACK_KEYWORD_PATTERN,
  GHL_EVENT_TO_RECIPES,
  INBOUND_RECIPES,
  SCHEDULED_RECIPE_OFFSETS,
  getN8nWebhookUrl,
} from "@/lib/recipes/eventMapping";
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
  const canonical = await supabase
    .from("recipe_triggers")
    .select("id, recipe_slug, contact_id, payload")
    .eq("account_id", accountId)
    .eq("contact_id", contactId)
    .eq("status", "queued")
    .in("recipe_slug", activeRecipeSlugs);

  if (!canonical.error) {
    return (canonical.data ?? []) as PendingTrigger[];
  }

  // Rollback compatibility for pre-status schema.
  const legacy = await supabase
    .from("recipe_triggers")
    .select("id, recipe_slug, contact_id, payload")
    .eq("account_id", accountId)
    .eq("contact_id", contactId)
    .eq("fired", false)
    .in("recipe_slug", activeRecipeSlugs);

  if (legacy.error) {
    throw new Error(`failed to load pending triggers: ${canonical.error.message}`);
  }

  return (legacy.data ?? []) as PendingTrigger[];
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

  const canonicalDelete = await supabase
    .from("recipe_triggers")
    .delete()
    .eq("account_id", accountId)
    .eq("contact_id", contactId)
    .eq("status", "queued")
    .in("id", triggerIds);

  if (canonicalDelete.error) {
    const legacyDelete = await supabase
      .from("recipe_triggers")
      .delete()
      .eq("account_id", accountId)
      .eq("contact_id", contactId)
      .eq("fired", false)
      .in("id", triggerIds);

    if (legacyDelete.error) {
      throw new Error(`failed to delete pending triggers: ${canonicalDelete.error.message}`);
    }
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
    status: "queued",
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

async function triggerRecipesFromGhlEvent(
  accountId: string,
  event: AutomationEventInsert,
  rawPayload: Record<string, unknown>,
  activeRecipes: ActiveRecipe[],
): Promise<void> {
  const eventType = event.ghl_event_type ?? "";
  const slugs = GHL_EVENT_TO_RECIPES[eventType];
  if (!slugs?.length) return;

  const contactId = contactIdFrom(event, rawPayload);
  const supabase = getSupabaseAdmin();

  for (const slug of slugs) {
    if (!activeRecipes.some((r) => r.recipe_slug === slug)) continue;

    if (INBOUND_RECIPES.has(slug)) {
      // Pattern A — fire immediately to N8N webhook
      const url = getN8nWebhookUrl(slug, accountId);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId,
            contactName: event.contact_name ?? null,
            contactPhone: event.contact_phone ?? null,
            accountId,
            ghlEventType: eventType,
            ghlEventId: event.ghl_event_id ?? null,
          }),
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) {
          console.warn(`[ghl-webhook] n8n inbound webhook ${slug} responded ${res.status}`);
        }
      } catch (err) {
        console.error(`[ghl-webhook] n8n inbound webhook ${slug} failed`, err);
      }

      await supabase.from("automation_events").insert({
        account_id: accountId,
        recipe_slug: slug,
        event_type: "recipe_triggered",
        ghl_event_type: eventType,
        ghl_event_id: `${event.ghl_event_id ?? ""}:recipe-trigger:${slug}`,
        contact_id: contactId,
        contact_phone: event.contact_phone ?? null,
        contact_name: event.contact_name ?? null,
        summary: `Recipe "${slug}" triggered by ${eventType} for ${event.contact_name ?? event.contact_phone ?? "contact"}`,
        detail: { recipe_slug: slug, triggered_by: "ghl_event" },
      });
    } else {
      // Pattern B — scheduled: insert recipe_triggers rows with future fire_at
      const offsets = SCHEDULED_RECIPE_OFFSETS[slug] ?? [];
      if (offsets.length === 0) continue;

      // Appointment reminders fire relative to the appointment's startTime (supports
      // negative offsets = "N minutes before appointment"). All other scheduled recipes
      // fire relative to the current moment (event receipt time).
      let baseMs = Date.now();
      if (slug === "appointment-reminder") {
        const raw =
          rawPayload.startTime ?? rawPayload.appointmentStartTime ?? rawPayload.start_time;
        if (typeof raw === "string") {
          const t = new Date(raw).getTime();
          if (!isNaN(t)) baseMs = t;
        }
      }

      for (const { offsetMinutes, label } of offsets) {
        const fireAt = new Date(baseMs + offsetMinutes * 60 * 1_000);
        // Skip triggers that would fire in the past (e.g. reminder for an
        // appointment that already started, or a 48h follow-up for an old lead).
        if (fireAt.getTime() <= Date.now()) continue;

        await supabase.from("recipe_triggers").insert({
          account_id: accountId,
          recipe_slug: slug,
          ghl_event_type: eventType,
          contact_id: contactId,
          fire_at: fireAt.toISOString(),
          status: "queued",
          payload: {
            contactId,
            contactName: event.contact_name ?? null,
            contactPhone: event.contact_phone ?? null,
            accountId,
            ghlEventType: eventType,
            ghlEventId: event.ghl_event_id ?? null,
            label,
          },
        });
      }
    }
  }
}

async function detectCallbackFromNote(
  accountId: string,
  event: AutomationEventInsert,
  rawPayload: Record<string, unknown>,
): Promise<void> {
  if (event.ghl_event_type !== "NoteCreate") return;

  const body =
    typeof rawPayload.body === "string"
      ? rawPayload.body
      : typeof rawPayload.message === "string"
        ? rawPayload.message
        : "";

  if (!CALLBACK_KEYWORD_PATTERN.test(body)) return;

  const contactId = contactIdFrom(event, rawPayload);
  if (!contactId) return;

  // Dynamic import avoids a circular dependency between callback.ts and
  // webhookSideEffects.ts (callback.ts imports processSideEffects from here).
  const { markCallbackNeeded } = await import("@/lib/recipes/callback");

  await markCallbackNeeded({
    accountId,
    contactId,
    reason: body.slice(0, 500),
    source: "ghl_note",
    contactPhone: event.contact_phone,
    contactName: event.contact_name,
    sourceEventId: event.ghl_event_id,
  });
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
    runSideEffect("callback detection from note", () =>
      detectCallbackFromNote(accountId, event, rawPayload),
    ),
    runSideEffect("recipe event triggers", () =>
      triggerRecipesFromGhlEvent(accountId, event, rawPayload, activeRecipes),
    ),
  ]);
}
