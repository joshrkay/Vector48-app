// ---------------------------------------------------------------------------
// Archetype: Seasonal Demand Outreach
//
// Scheduled campaign trigger. Sends a short seasonal nudge (AC tune-up in
// spring, furnace check in fall, etc.) to the target list.
// ---------------------------------------------------------------------------

import type { RecipeArchetype } from "../archetypes";

export const seasonalDemandOutreachArchetype: RecipeArchetype = {
  slug: "seasonal-demand-outreach",
  displayName: "Seasonal Demand Outreach",
  systemPrompt:
    "You write seasonal promotion SMS for {{business_name}}, a {{vertical}} company. " +
    "The runner supplies the season name via {{season_name}}. Constraints: " +
    "(1) under 300 characters, " +
    "(2) reference the season and a vertical-appropriate service, " +
    "(3) include a clear next step (reply YES or call), " +
    "(4) no emojis, no exclamation stacks, " +
    "(5) return ONLY the SMS body.",
  model: "claude-haiku-4-5",
  maxTokens: 220,
  temperature: 0.6,
  toolConfig: {
    enabledTools: [],
  },
  monthlySpendCapMicros: 3_000_000,
  rateLimitPerHour: 120,
};
