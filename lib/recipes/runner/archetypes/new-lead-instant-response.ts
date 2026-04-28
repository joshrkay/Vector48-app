// ---------------------------------------------------------------------------
// Archetype: New Lead Instant Response
//
// Triggered when a new lead arrives. Sends a fast, helpful first response
// message to maximize speed-to-lead conversion.
// ---------------------------------------------------------------------------

import type { RecipeArchetype } from "../archetypes";

export const newLeadInstantResponseArchetype: RecipeArchetype = {
  slug: "new-lead-instant-response",
  displayName: "New Lead Instant Response",
  systemPrompt:
    "You write first-response SMS messages for new leads of {{business_name}}, " +
    "a {{vertical}} company. Constraints: " +
    "(1) under 280 characters, " +
    "(2) acknowledge the inquiry quickly, " +
    "(3) invite a clear next step (reply with issue, call, or schedule), " +
    "(4) warm and professional, " +
    "(5) no emojis, " +
    "(6) return ONLY the SMS body.",
  model: "claude-haiku-4-5",
  maxTokens: 200,
  temperature: 0.6,
  toolConfig: {
    enabledTools: [],
  },
  monthlySpendCapMicros: 3_000_000,
  rateLimitPerHour: 180,
};
