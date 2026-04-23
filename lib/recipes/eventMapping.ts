// ---------------------------------------------------------------------------
// Recipe ↔ GHL Event Mapping — Single source of truth for which GHL webhook
// events trigger which recipes, and the scheduling offsets for Pattern B.
// ---------------------------------------------------------------------------

/**
 * Maps GHL webhook event types to the recipe slugs they can trigger.
 * "Inbound" recipes fire immediately via n8n webhook.
 * "Scheduled" recipes write to recipe_triggers with a delay.
 */
export const GHL_EVENT_TO_RECIPES: Record<string, string[]> = {
  // Recipe 1 — AI Phone Answering: handled by Voice AI agent directly,
  // no GHL webhook needed (Voice AI custom action fires to n8n).

  // Recipe 2 — Missed Call Text-Back (inbound → n8n)
  CallStatusUpdate: ["missed-call-text-back"],

  // Recipe 3 — Review Request (scheduled)
  OpportunityStatusUpdate: ["review-request"],

  // Recipe 4 — Estimate Follow-Up (scheduled)
  OpportunityCreate: ["estimate-follow-up"],

  // Recipe 5 — Appointment Reminder (scheduled)
  AppointmentCreate: ["appointment-reminder"],
  AppointmentUpdate: ["appointment-reminder"],

  // Callback-needed synthetic event — fires when a contact is flagged as
  // needing a callback via any of three sources (NoteCreate webhook with
  // callback keyword, operator UI button, or Voice AI transcript classifier).
  // Normalized through lib/recipes/callback.ts markCallbackNeeded().
  CallbackNeeded: ["missed-call-text-back", "new-lead-instant-response"],
};

/**
 * Keyword regex that detects callback intent in free-text fields (note
 * bodies, call transcripts). Kept here so both the webhook handler and
 * the Voice AI classifier share one source of truth.
 */
export const CALLBACK_KEYWORD_PATTERN = /\b(call\s*me\s*back|callback|please\s*call)\b/i;

export function textImpliesCallback(text: string | null | undefined): boolean {
  if (!text) return false;
  return CALLBACK_KEYWORD_PATTERN.test(text);
}

/**
 * For scheduled (Pattern B) recipes, defines the delay offsets from the
 * triggering event. Positive = after event, negative = before event timestamp.
 */
export const SCHEDULED_RECIPE_OFFSETS: Record<
  string,
  { offsetMinutes: number; label: string }[]
> = {
  // Recipe 3 — Review Request: 2 hours after opportunity marked "won"
  "review-request": [{ offsetMinutes: 120, label: "2h after job won" }],

  // Recipe 4 — Estimate Follow-Up: 24h and 48h after estimate created
  "estimate-follow-up": [
    { offsetMinutes: 1440, label: "24h after estimate" },
    { offsetMinutes: 2880, label: "48h after estimate" },
  ],

  // Recipe 5 — Appointment Reminder: 24h and 2h before appointment
  // NOTE: These are negative offsets applied to the appointment start time,
  // not to the webhook receipt time. The webhook handler must extract the
  // appointment startTime and subtract these offsets.
  "appointment-reminder": [
    { offsetMinutes: -1440, label: "24h before appointment" },
    { offsetMinutes: -120, label: "2h before appointment" },
  ],
};

/**
 * Recipes that fire immediately to n8n (Pattern A — inbound).
 * The webhook handler POSTs directly to n8n instead of writing recipe_triggers.
 */
export const INBOUND_RECIPES = new Set(["missed-call-text-back"]);

/**
 * n8n webhook path for a given recipe + account.
 * Pattern: {N8N_WEBHOOK_BASE_URL}/recipe-{slug}/{accountId}
 */
export function getN8nWebhookUrl(
  recipeSlug: string,
  accountId: string,
): string {
  const base = (process.env.N8N_WEBHOOK_BASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/recipe-${recipeSlug}/${accountId}`;
}

/**
 * n8n pause webhook URL — called by pause-for-contact to signal N8N to
 * abort in-flight executions for a specific contact.
 * Pattern: {N8N_WEBHOOK_BASE_URL}/recipe-{slug}-pause/{accountId}
 */
export function getPauseWebhookUrl(
  recipeSlug: string,
  accountId: string,
): string {
  const base = (process.env.N8N_WEBHOOK_BASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/recipe-${recipeSlug}-pause/${accountId}`;
}

/**
 * n8n resume webhook URL — called by resume-for-contact to signal N8N that
 * the contact's pause has been lifted.
 * Pattern: {N8N_WEBHOOK_BASE_URL}/recipe-{slug}-resume/{accountId}
 */
export function getResumeWebhookUrl(
  recipeSlug: string,
  accountId: string,
): string {
  const base = (process.env.N8N_WEBHOOK_BASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/recipe-${recipeSlug}-resume/${accountId}`;
}
