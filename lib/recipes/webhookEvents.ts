// ---------------------------------------------------------------------------
// Recipe webhook event configuration — maps recipe slugs to the GHL webhook
// event types they require.
// ---------------------------------------------------------------------------

const RECIPE_WEBHOOK_EVENTS: Record<string, string[]> = {
  "ai-phone-answering": ["InboundMessage", "Call", "ContactCreate", "ContactUpdate"],
  "missed-call-text-back": ["CallCompleted", "ContactCreate", "ContactUpdate"],
  "review-request": ["OpportunityStatusUpdate", "ContactCreate"],
  "estimate-follow-up": ["OpportunityCreate", "ContactCreate"],
  "appointment-reminder": ["AppointmentCreate", "AppointmentStatusUpdate", "ContactCreate"],
};

const FALLBACK_EVENTS: string[] = ["ContactCreate", "ContactUpdate"];

/**
 * Returns the list of GHL webhook event types needed by a given recipe.
 * Falls back to a minimal default set if the recipe has no explicit config.
 */
export function getWebhookEventsForRecipe(recipeSlug: string): string[] {
  return RECIPE_WEBHOOK_EVENTS[recipeSlug] ?? FALLBACK_EVENTS;
}

/**
 * Returns true if the recipe has an explicit webhook event configuration.
 */
export function hasRecipeWebhookConfig(recipeSlug: string): boolean {
  return Object.prototype.hasOwnProperty.call(RECIPE_WEBHOOK_EVENTS, recipeSlug);
}
