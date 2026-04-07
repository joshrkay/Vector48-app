const DEFAULT_WEBHOOK_EVENTS = ["ContactCreate", "ContactUpdate"] as const;

const RECIPE_WEBHOOK_EVENTS: Record<string, readonly string[]> = {
  // ── n8n recipes ─────────────────────────────────────────────────────────
  "ai-phone-answering": [
    "InboundMessage",
    "Call",
    "ContactCreate",
    "ContactUpdate",
  ],
  "missed-call-text-back": ["Call", "ContactCreate", "ContactUpdate"],

  // ── GHL-native recipes ──────────────────────────────────────────────────
  "google-review-booster": ["AppointmentUpdate", "OpportunityStatusUpdate"],
  "new-lead-instant-response": ["ContactCreate"],
  "seasonal-demand-outreach": ["ContactCreate", "ContactUpdate"], // scheduled/cron-driven
  "tech-on-the-way": ["AppointmentUpdate"],
  "post-job-upsell": ["AppointmentUpdate", "OpportunityStatusUpdate"],
  "maintenance-plan-enrollment": ["AppointmentUpdate", "OpportunityStatusUpdate"],
  "customer-reactivation": ["ContactCreate", "ContactUpdate"], // cron-driven inactive check
  "unsold-estimate-reactivation": ["OpportunityStatusUpdate", "ContactUpdate"],
  "weather-event-outreach": ["ContactCreate", "ContactUpdate"], // manually triggered
};

export function getWebhookEventsForRecipe(recipeSlug: string): readonly string[] {
  return RECIPE_WEBHOOK_EVENTS[recipeSlug] ?? DEFAULT_WEBHOOK_EVENTS;
}

export function hasRecipeWebhookConfig(recipeSlug: string): boolean {
  return recipeSlug in RECIPE_WEBHOOK_EVENTS;
}
