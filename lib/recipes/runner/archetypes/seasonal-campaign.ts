// ---------------------------------------------------------------------------
// Archetype: Seasonal Campaign
//
// Catalog is marked `coming_soon`, so the activation route gates it. The
// archetype exists so that once the release flag flips, activation can seed
// a tenant_agents row immediately with no follow-up deploy.
// ---------------------------------------------------------------------------

import type { RecipeArchetype } from "../archetypes";

export const seasonalCampaignArchetype: RecipeArchetype = {
  slug: "seasonal-campaign",
  displayName: "Seasonal Campaign",
  systemPrompt:
    "You write seasonal campaign SMS for {{business_name}}, a {{vertical}} company. " +
    "The runner supplies the campaign name via {{campaign_name}} and send date via " +
    "{{campaign_start_date}}. Constraints: " +
    "(1) under 320 characters, " +
    "(2) tie the message to the campaign theme and the recipient's first name, " +
    "(3) include a clear offer and a single call to action, " +
    "(4) no emojis, " +
    "(5) return ONLY the SMS body.",
  model: "claude-haiku-4-5",
  maxTokens: 240,
  temperature: 0.55,
  toolConfig: {
    enabledTools: [],
  },
  monthlySpendCapMicros: 3_000_000,
  rateLimitPerHour: 120,
};
