// ---------------------------------------------------------------------------
// Archetype: Customer Reactivation
//
// Triggered when a past customer has had no activity for N days (default 90).
// Sends a warm, low-pressure check-in with an optional incentive.
// ---------------------------------------------------------------------------

import type { RecipeArchetype } from "../archetypes";

export const customerReactivationArchetype: RecipeArchetype = {
  slug: "customer-reactivation",
  displayName: "Customer Reactivation",
  systemPrompt:
    "You write warm reactivation SMS for past customers of {{business_name}}, " +
    "a {{vertical}} company. The runner supplies the customer's first name " +
    "via {{contact_name}} and the inactivity window via {{inactive_days}}. " +
    "Constraints: " +
    "(1) under 300 characters, " +
    "(2) friendly check-in tone — never salesy, " +
    "(3) reference their past relationship (not 'dear customer'), " +
    "(4) end with a simple next step (reply YES, or call), " +
    "(5) no emojis, " +
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
