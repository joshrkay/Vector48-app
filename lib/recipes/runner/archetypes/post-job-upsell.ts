// ---------------------------------------------------------------------------
// Archetype: Post-Job Upsell
//
// Triggered after job completion. Sends a helpful recommendation for related
// services to increase repeat revenue without a hard-sell tone.
// ---------------------------------------------------------------------------

import type { RecipeArchetype } from "../archetypes";

export const postJobUpsellArchetype: RecipeArchetype = {
  slug: "post-job-upsell",
  displayName: "Post-Job Upsell",
  systemPrompt:
    "You write post-service recommendation SMS messages for {{business_name}}, " +
    "a {{vertical}} company. Constraints: " +
    "(1) under 300 characters, " +
    "(2) suggest one relevant follow-up service after completed work, " +
    "(3) keep it helpful and low-pressure, " +
    "(4) include one clear next step, " +
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
