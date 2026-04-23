// ---------------------------------------------------------------------------
// Callback-Needed normalization layer.
//
// Three sources converge here:
//   1. GHL NoteCreate webhook whose body matches CALLBACK_KEYWORD_PATTERN
//   2. Operator clicking "Mark needs callback" in /crm/contacts/[id]
//   3. Voice AI transcript classifier detecting callback intent post-call
//
// Each source calls markCallbackNeeded() with a `source` discriminator. The
// function writes the state to GHL (tag + custom field) and emits a single
// synthetic `CallbackNeeded` automation event that downstream recipes
// (missed-call-text-back, new-lead-instant-response) listen for via
// eventMapping.GHL_EVENT_TO_RECIPES.
// ---------------------------------------------------------------------------

import { addContactTag, updateContact } from "@/lib/ghl/contacts";
import { getAccountGhlCredentials } from "@/lib/ghl/token";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { processSideEffects } from "@/lib/ghl/webhookSideEffects";
import type { AutomationEventInsert } from "@/lib/ghl/webhookTypes";

export type CallbackSource = "ghl_note" | "ui_button" | "voice_ai_transcript";

export interface MarkCallbackNeededParams {
  accountId: string;
  contactId: string;
  reason: string;
  source: CallbackSource;
  contactPhone?: string | null;
  contactName?: string | null;
  sourceEventId?: string | null;
}

export interface MarkCallbackNeededResult {
  eventId: string;
  ghlWrites: {
    tagAdded: boolean;
    customFieldUpdated: boolean;
  };
  warnings: string[];
}

const CALLBACK_TAG = "needs-callback";
const CALLBACK_CUSTOM_FIELD_KEY = "v48_callback_needed";
const CALLBACK_REASON_FIELD_KEY = "v48_callback_reason";

/**
 * Normalize a callback-needed signal from any source into:
 *   - a GHL tag + custom field write (so the CRM shows it)
 *   - an automation_events row with event_type 'callback_needed'
 *   - downstream recipe triggers via processSideEffects (pattern A/B)
 *
 * Callers should not throw on partial failure — GHL writes are best-effort
 * and warnings are returned so the caller can surface them if needed.
 */
export async function markCallbackNeeded(
  params: MarkCallbackNeededParams,
): Promise<MarkCallbackNeededResult> {
  const { accountId, contactId, reason, source } = params;
  const warnings: string[] = [];
  const ghlWrites = { tagAdded: false, customFieldUpdated: false };

  // 1. Fetch GHL credentials for this tenant (scoped — never cross-tenant).
  const creds = await getAccountGhlCredentials(accountId).catch((err: Error) => {
    warnings.push(`ghl_credentials_missing: ${err.message}`);
    return null;
  });

  // 2. Best-effort GHL writes: tag + custom field. Do not abort on failure —
  //    we still want the internal event recorded so the recipe fires.
  if (creds) {
    try {
      await addContactTag(contactId, [CALLBACK_TAG], {
        locationId: creds.locationId,
        apiKey: creds.token,
      });
      ghlWrites.tagAdded = true;
    } catch (err) {
      warnings.push(
        `ghl_tag_write_failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    try {
      await updateContact(
        contactId,
        {
          customFields: [
            { id: CALLBACK_CUSTOM_FIELD_KEY, value: true } as never,
            { id: CALLBACK_REASON_FIELD_KEY, value: reason } as never,
          ],
        },
        {
          locationId: creds.locationId,
          apiKey: creds.token,
        },
      );
      ghlWrites.customFieldUpdated = true;
    } catch (err) {
      warnings.push(
        `ghl_custom_field_write_failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 3. Insert the canonical automation_events row. This is the source of
  //    truth for the dashboard feed and for dedup downstream.
  const supabase = getSupabaseAdmin();
  const eventId = buildEventId(accountId, contactId, source, params.sourceEventId ?? null);

  const event: AutomationEventInsert = {
    account_id: accountId,
    recipe_slug: null,
    event_type: "callback_needed",
    ghl_event_type: "CallbackNeeded",
    ghl_event_id: eventId,
    contact_id: contactId,
    contact_phone: params.contactPhone ?? null,
    contact_name: params.contactName ?? null,
    summary: buildSummary(params),
    detail: {
      reason,
      source,
      source_event_id: params.sourceEventId ?? null,
      ghl_tag_added: ghlWrites.tagAdded,
      ghl_custom_field_updated: ghlWrites.customFieldUpdated,
    },
  };

  const { error: insertError } = await supabase
    .from("automation_events")
    .insert(event);

  let wasDeduped = false;
  if (insertError) {
    // Unique-index conflict on (account_id, ghl_event_id) is expected when
    // the same note webhook is re-delivered. Treat as success.
    if (!isDuplicateKeyError(insertError)) {
      throw new Error(
        `failed to insert callback_needed event: ${insertError.message}`,
      );
    }
    wasDeduped = true;
    warnings.push("automation_events_dedup_hit");
  }

  // 4. Fan out to recipe side effects. processSideEffects reads
  //    GHL_EVENT_TO_RECIPES["CallbackNeeded"] and enqueues the right recipes.
  //    Skip this on dedup — the first delivery already fanned out and we
  //    must not trigger duplicate outbound SMS / recipe_triggers rows.
  if (!wasDeduped) {
    try {
      await processSideEffects(accountId, event, {
        contactId,
        contact: { id: contactId, phone: params.contactPhone ?? undefined },
        reason,
        source,
      });
    } catch (err) {
      warnings.push(
        `side_effects_failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    eventId,
    ghlWrites,
    warnings,
  };
}

function buildEventId(
  accountId: string,
  contactId: string,
  source: CallbackSource,
  sourceEventId: string | null,
): string {
  const stamp = sourceEventId ?? `${Date.now()}`;
  return `CallbackNeeded:${accountId}:${contactId}:${source}:${stamp}`;
}

function buildSummary(params: MarkCallbackNeededParams): string {
  const who = params.contactName ?? params.contactPhone ?? "contact";
  switch (params.source) {
    case "ghl_note":
      return `Callback needed (from note): ${who}`;
    case "ui_button":
      return `Callback needed (flagged by operator): ${who}`;
    case "voice_ai_transcript":
      return `Callback needed (AI detected in transcript): ${who}`;
  }
}

function isDuplicateKeyError(error: { code?: string; message?: string }): boolean {
  if (error.code === "23505") return true;
  const msg = error.message ?? "";
  return /duplicate key|unique constraint/i.test(msg);
}
