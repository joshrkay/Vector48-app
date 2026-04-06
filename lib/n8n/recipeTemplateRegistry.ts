// ---------------------------------------------------------------------------
// Recipe slug → template filename (no Node fs — safe for client imports).
// ---------------------------------------------------------------------------

export const RECIPE_TEMPLATE_PATHS: Record<string, string> = {
  "ai-phone-answering": "ai-phone-answering.json",
  "missed-call-text-back": "missed-call-text-back.json",
  "review-request": "review-request.json",
  "estimate-follow-up": "estimate-follow-up.json",
  "appointment-reminder": "appointment-reminder.json",
};

/**
 * Per-recipe webhook path prefix used when provisioning.
 * Recipe 1 keeps its legacy "ai-phone" prefix for backward compatibility.
 * Recipes 2-5 use descriptive prefixes matching their template webhook paths.
 */
/**
 * Per-recipe webhook path prefix used when provisioning.
 * Recipe 1 keeps its legacy "ai-phone" prefix for backward compatibility.
 * Recipes 2-5 use descriptive prefixes matching their template webhook paths.
 */
export const RECIPE_WEBHOOK_PATH_PREFIX: Record<string, string> = {
  "ai-phone-answering": "ai-phone",
  "missed-call-text-back": "recipe-missed-call-textback",
  "review-request": "recipe-review-request",
  "estimate-follow-up": "recipe-estimate-followup",
  "appointment-reminder": "recipe-appointment-reminder",
};
