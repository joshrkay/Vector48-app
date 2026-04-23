// ---------------------------------------------------------------------------
// Archetype: Google Review Booster
//
// Triggered after a job is marked complete. Generates a short, polite SMS
// asking the customer to leave a Google review, with the literal
// `{{review_link}}` token where the runner will inject the tenant's URL.
// ---------------------------------------------------------------------------

import type { RecipeArchetype } from "../archetypes";

export const googleReviewBoosterArchetype: RecipeArchetype = {
  slug: "google-review-booster",
  displayName: "Google Review Booster",
  systemPrompt:
    "You write concise Google-review request SMS messages for {{business_name}}, " +
    "a {{vertical}} company. Constraints: " +
    "(1) under 280 characters, " +
    "(2) warm, grateful, conversational — not corporate, " +
    "(3) include the literal token {{review_link}} where the URL should go, " +
    "(4) no emojis, " +
    "(5) single paragraph, " +
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
