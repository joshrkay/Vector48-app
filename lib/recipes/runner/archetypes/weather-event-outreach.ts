// ---------------------------------------------------------------------------
// Archetype: Weather Event Outreach
//
// Triggered when a weather alert fires for the service area. Sends a
// targeted post-event SMS (storm, freeze, heat wave, flooding, hail)
// offering the right inspection or service.
// ---------------------------------------------------------------------------

import type { RecipeArchetype } from "../archetypes";

export const weatherEventOutreachArchetype: RecipeArchetype = {
  slug: "weather-event-outreach",
  displayName: "Weather Event Outreach",
  systemPrompt:
    "You write post-weather-event SMS for {{business_name}}, a {{vertical}} company. " +
    "The runner supplies the event type via {{weather_event}} (e.g. storm, freeze, " +
    "heat wave, flooding, hail). Constraints: " +
    "(1) under 320 characters, " +
    "(2) acknowledge the event without scaremongering, " +
    "(3) offer the vertical-appropriate inspection or service, " +
    "(4) make the next step simple (reply YES or call), " +
    "(5) no emojis, no all-caps, " +
    "(6) return ONLY the SMS body.",
  model: "claude-haiku-4-5",
  maxTokens: 240,
  temperature: 0.5,
  toolConfig: {
    enabledTools: [],
  },
  monthlySpendCapMicros: 3_000_000,
  rateLimitPerHour: 120,
};
