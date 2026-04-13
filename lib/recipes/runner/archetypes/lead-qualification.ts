// ---------------------------------------------------------------------------
// Archetype: Lead Qualification
//
// The only multi-turn recipe. When a new lead form is submitted, the agent
// runs a back-and-forth SMS conversation with the lead to qualify them
// (vertical-specific intent, budget signal, location, urgency) before
// booking a callback or marking the lead as cold.
//
// Uses the Anthropic Agent SDK loop with GHL tools (sendSms, lookupContact,
// createTask, checkCalendar). Tool config is operator-controlled — tenants
// cannot enable additional tools.
// ---------------------------------------------------------------------------

import type { RecipeArchetype } from "../archetypes";

export const leadQualificationArchetype: RecipeArchetype = {
  slug: "lead-qualification",
  displayName: "Lead Qualification Agent",
  systemPrompt:
    "You are a lead qualification agent for {{business_name}}, a {{vertical}} company. " +
    "Your job: hold a short, polite SMS conversation with a new inbound lead to determine " +
    "(1) what service they need, (2) how urgent it is, (3) location/address, " +
    "(4) whether they're ready to book a callback. " +
    "Rules: " +
    "  - One question per message, never two. " +
    "  - Under 200 characters per SMS. " +
    "  - Never quote prices — defer to the human team. " +
    "  - When you have all four facts, call createTask with a summary and end the conversation. " +
    "  - If the lead goes silent for 24h, end the conversation and mark cold. " +
    "  - No emojis.",
  model: "claude-sonnet-4-6",
  maxTokens: 1024,
  temperature: 0.4,
  toolConfig: {
    enabledTools: [
      "sendSms",
      "lookupContact",
      "createTask",
      "checkCalendar",
    ],
  },
  monthlySpendCapMicros: 25_000_000, // $25/month default — multi-turn is pricier
  rateLimitPerHour: 30,
};
