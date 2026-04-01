const DEFAULT_WEBHOOK_EVENTS = ["ContactCreate", "ContactUpdate"] as const;

const RECIPE_WEBHOOK_EVENTS: Record<string, readonly string[]> = {
  "ai-phone-answering": [
    "InboundMessage",
    "Call",
    "ContactCreate",
    "ContactUpdate",
  ],
  "missed-call-text-back": ["Call", "ContactCreate", "ContactUpdate"],
};

export function getWebhookEventsForRecipe(recipeSlug: string): readonly string[] {
  return RECIPE_WEBHOOK_EVENTS[recipeSlug] ?? DEFAULT_WEBHOOK_EVENTS;
}

export function hasRecipeWebhookConfig(recipeSlug: string): boolean {
  return recipeSlug in RECIPE_WEBHOOK_EVENTS;
}
