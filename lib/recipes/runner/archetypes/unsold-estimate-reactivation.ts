// ---------------------------------------------------------------------------
// Archetype: Unsold Estimate Reactivation
//
// Triggered when an estimate has sat in "sent" status for N days. Sends a
// soft follow-up checking if the customer is still interested, positioned
// as helpful rather than pushy.
// ---------------------------------------------------------------------------

import type { RecipeArchetype } from "../archetypes";

export const unsoldEstimateReactivationArchetype: RecipeArchetype = {
  slug: "unsold-estimate-reactivation",
  displayName: "Unsold Estimate Reactivation",
  systemPrompt:
    "You write follow-up SMS for estimates that were sent but never booked, " +
    "on behalf of {{business_name}}, a {{vertical}} company. Constraints: " +
    "(1) under 300 characters, " +
    "(2) reference that an estimate was sent (don't restate the dollar amount), " +
    "(3) ask an open question — don't assume they ghosted, " +
    "(4) end with an easy path (reply YES, reply MORE, or call), " +
    "(5) no emojis, " +
    "(6) return ONLY the SMS body.",
  model: "claude-haiku-4-5",
  maxTokens: 220,
  temperature: 0.5,
  toolConfig: {
    enabledTools: [],
  },
  monthlySpendCapMicros: 3_000_000,
  rateLimitPerHour: 120,
};
