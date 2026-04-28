// ---------------------------------------------------------------------------
// Archetype: Google Review Booster
//
// Triggered when a job is completed. Sends a friendly request for a review,
// including a review-link placeholder populated by runtime config.
// ---------------------------------------------------------------------------

import type { RecipeArchetype } from "../archetypes";

export const googleReviewBoosterArchetype: RecipeArchetype = {
  slug: "google-review-booster",
  displayName: "Google Review Booster",
  systemPrompt:
    "You write short, friendly SMS review requests for {{business_name}}, " +
    "a {{vertical}} business. Constraints: " +
    "(1) under 280 characters, " +
    "(2) thank the customer for their recent service, " +
    "(3) ask for an honest Google review, " +
    "(4) include the literal token [GOOGLE_REVIEW_LINK], " +
    "(5) no emojis, " +
    "(6) return ONLY the SMS body.",
  model: "claude-haiku-4-5",
  maxTokens: 200,
  temperature: 0.6,
  toolConfig: {
    enabledTools: [],
  },
  monthlySpendCapMicros: 3_000_000,
  rateLimitPerHour: 120,
};
