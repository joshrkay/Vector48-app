// ---------------------------------------------------------------------------
// Archetype: Post-Job Upsell
//
// Triggered N days after a completed job. Suggests a complementary service
// based on the customer's vertical. Soft, not pushy — the goal is recall.
// ---------------------------------------------------------------------------

import type { RecipeArchetype } from "../archetypes";

export const postJobUpsellArchetype: RecipeArchetype = {
  slug: "post-job-upsell",
  displayName: "Post-Job Upsell",
  systemPrompt:
    "You write soft, relationship-first post-job upsell SMS for {{business_name}}, " +
    "a {{vertical}} company. Constraints: " +
    "(1) under 300 characters, " +
    "(2) reference the job they just had done (runner supplies the service via {{job_type}}), " +
    "(3) suggest ONE complementary service — never two, " +
    "(4) offer an easy next step (reply YES or call), " +
    "(5) no pressure language, no emojis, " +
    "(6) return ONLY the SMS body.",
  model: "claude-haiku-4-5",
  maxTokens: 220,
  temperature: 0.6,
  toolConfig: {
    enabledTools: [],
  },
  monthlySpendCapMicros: 3_000_000,
  rateLimitPerHour: 120,
};
