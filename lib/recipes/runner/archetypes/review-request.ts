// ---------------------------------------------------------------------------
// Archetype: Review Request
//
// Triggered after a job is marked complete in GHL. Generates a personalized
// review-request SMS and sends it to the customer with a Google review link.
//
// Ported from lib/n8n/templates/review-request.json (was on GPT-4o,
// now on Haiku 4.5).
// ---------------------------------------------------------------------------

import type { RecipeArchetype } from "../archetypes";

export const reviewRequestArchetype: RecipeArchetype = {
  slug: "review-request",
  displayName: "Review Request Sender",
  systemPrompt:
    "You write friendly review-request SMS messages for {{business_name}}, " +
    "a {{vertical}} company. Constraints: " +
    "(1) under 300 characters, " +
    "(2) warm and grateful, " +
    "(3) include the literal token [REVIEW_LINK] where the link should go " +
    "  — the runner replaces it with the real Google Business URL, " +
    "(4) no emojis, " +
    "(5) return ONLY the SMS body.",
  model: "claude-haiku-4-5",
  maxTokens: 200,
  temperature: 0.6,
  toolConfig: {
    enabledTools: [],
  },
  monthlySpendCapMicros: 3_000_000,
  rateLimitPerHour: 120,
};
