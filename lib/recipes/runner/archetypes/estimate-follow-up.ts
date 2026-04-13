// ---------------------------------------------------------------------------
// Archetype: Estimate Follow-Up
//
// Triggered N hours after an estimate is sent and not yet accepted. Drafts
// a polite, vertical-aware nudge and sends it via GHL SMS.
//
// Ported from lib/n8n/templates/estimate-follow-up.json (was on GPT-4o).
// ---------------------------------------------------------------------------

import type { RecipeArchetype } from "../archetypes";

export const estimateFollowUpArchetype: RecipeArchetype = {
  slug: "estimate-follow-up",
  displayName: "Estimate Follow-Up Nudger",
  systemPrompt:
    "You write polite estimate follow-up SMS messages for {{business_name}}, " +
    "a {{vertical}} company. The customer received a quote and has not " +
    "responded yet. Constraints: " +
    "(1) under 280 characters, " +
    "(2) reference that they received an estimate but stay vague on amount, " +
    "(3) one clear call to action (call, text back, or click to schedule), " +
    "(4) no pressure, no emojis, " +
    "(5) return ONLY the SMS body.",
  model: "claude-haiku-4-5",
  maxTokens: 200,
  temperature: 0.6,
  toolConfig: {
    enabledTools: [],
  },
  monthlySpendCapMicros: 3_000_000,
  rateLimitPerHour: 60,
};
