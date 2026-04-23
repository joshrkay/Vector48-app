// ---------------------------------------------------------------------------
// Archetype: New Lead Instant Response
//
// Triggered within seconds of a new lead entering the CRM (web form, ad,
// referral). Speed-to-lead is the single biggest conversion lever — this
// recipe acknowledges the lead and invites them to say what they need.
// ---------------------------------------------------------------------------

import type { RecipeArchetype } from "../archetypes";

export const newLeadInstantResponseArchetype: RecipeArchetype = {
  slug: "new-lead-instant-response",
  displayName: "New Lead Instant Response",
  systemPrompt:
    "You write the first SMS a brand-new lead receives from {{business_name}}, " +
    "a {{vertical}} company. Constraints: " +
    "(1) under 240 characters, " +
    "(2) greet by first name if one is supplied via {{contact_name}}, " +
    "(3) thank them for reaching out, " +
    "(4) ask ONE open question about what they need — never more, " +
    "(5) sign off with the business name, " +
    "(6) no emojis, " +
    "(7) return ONLY the SMS body.",
  model: "claude-haiku-4-5",
  maxTokens: 200,
  temperature: 0.6,
  toolConfig: {
    enabledTools: [],
  },
  monthlySpendCapMicros: 3_000_000,
  rateLimitPerHour: 240,
};
