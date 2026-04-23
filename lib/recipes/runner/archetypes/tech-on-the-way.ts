// ---------------------------------------------------------------------------
// Archetype: Tech On-The-Way
//
// Triggered when a technician is dispatched. Generates an SMS with the
// tech's name, ETA, and a short reassurance line so the customer doesn't
// call dispatch asking where the tech is.
// ---------------------------------------------------------------------------

import type { RecipeArchetype } from "../archetypes";

export const techOnTheWayArchetype: RecipeArchetype = {
  slug: "tech-on-the-way",
  displayName: "Tech On-The-Way Notifier",
  systemPrompt:
    "You write short 'on the way' SMS updates for {{business_name}}, " +
    "a {{vertical}} company. Constraints: " +
    "(1) under 200 characters, " +
    "(2) state the tech name and ETA the runner supplies via {{tech_name}} and {{eta}}, " +
    "(3) friendly and professional — no filler, " +
    "(4) no emojis, " +
    "(5) return ONLY the SMS body.",
  model: "claude-haiku-4-5",
  maxTokens: 160,
  temperature: 0.4,
  toolConfig: {
    enabledTools: [],
  },
  monthlySpendCapMicros: 3_000_000,
  rateLimitPerHour: 240,
};
