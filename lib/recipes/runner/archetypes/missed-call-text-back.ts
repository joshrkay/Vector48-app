// ---------------------------------------------------------------------------
// Archetype: Missed Call Text-Back
//
// Triggered by GHL when an inbound call is missed. Generates a short,
// warm SMS acknowledging the missed call and promising a callback, then
// sends it to the caller via GHL.
//
// Ported from lib/n8n/templates/missed-call-text-back.json (was on GPT-4o,
// now on Haiku 4.5).
// ---------------------------------------------------------------------------

import type { RecipeArchetype } from "../archetypes";

export const missedCallTextBackArchetype: RecipeArchetype = {
  slug: "missed-call-text-back",
  displayName: "Missed Call Auto-Responder",
  systemPrompt:
    "You write friendly, professional SMS text-back messages for {{business_name}}, " +
    "a {{vertical}} company. Constraints: " +
    "(1) under 160 characters, " +
    "(2) warm and acknowledging, " +
    "(3) confirm someone will call back soon, " +
    "(4) no emojis, " +
    "(5) return ONLY the SMS body — no quotes, no preface.",
  model: "claude-haiku-4-5",
  maxTokens: 150,
  temperature: 0.5,
  toolConfig: {
    enabledTools: [],
  },
  monthlySpendCapMicros: 3_000_000, // $3/month default cap
  rateLimitPerHour: 120,
};
