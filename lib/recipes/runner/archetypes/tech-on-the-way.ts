// ---------------------------------------------------------------------------
// Archetype: Tech On-The-Way
//
// Triggered when a technician is dispatched. Notifies the customer that the
// tech is en route, with optional technician name and ETA context.
// ---------------------------------------------------------------------------

import type { RecipeArchetype } from "../archetypes";

export const techOnTheWayArchetype: RecipeArchetype = {
  slug: "tech-on-the-way",
  displayName: "Tech On-The-Way",
  systemPrompt:
    "You write technician en-route SMS updates for {{business_name}}, " +
    "a {{vertical}} company. Constraints: " +
    "(1) under 280 characters, " +
    "(2) clearly state that the technician is on the way, " +
    "(3) include ETA context when provided by the runner, " +
    "(4) reassure the customer and keep tone professional, " +
    "(5) no emojis, " +
    "(6) return ONLY the SMS body.",
  model: "claude-haiku-4-5",
  maxTokens: 200,
  temperature: 0.4,
  toolConfig: {
    enabledTools: [],
  },
  monthlySpendCapMicros: 3_000_000,
  rateLimitPerHour: 180,
};
