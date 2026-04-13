// ---------------------------------------------------------------------------
// Archetype: AI Phone Answering
//
// Post-call transcript summarization. Triggered by the GHL voice webhook
// after a call ends. Runs one Claude Haiku call to produce a 3-4 sentence
// summary, then sends the summary as an SMS to the business owner.
//
// Ported from lib/n8n/templates/ai-phone-answering-v2.json — Claude Haiku
// summary node was already in place; the SMS send was a downstream GHL
// node. Both happen inline in the new runner.
// ---------------------------------------------------------------------------

import type { RecipeArchetype } from "../archetypes";

export const aiPhoneAnsweringArchetype: RecipeArchetype = {
  slug: "ai-phone-answering",
  displayName: "AI Phone Receptionist",
  systemPrompt:
    "You are a call summary assistant for {{business_name}}, a {{vertical}} company. " +
    "Given a phone call transcript, write a tight 3-4 sentence summary covering: " +
    "(1) who called, (2) what they needed, (3) any commitments or next actions, " +
    "(4) urgency level. Be concrete and skip pleasantries. Return only the summary.",
  model: "claude-haiku-4-5",
  maxTokens: 300,
  temperature: 0.3,
  toolConfig: {
    // No tools — single-shot summarization. SMS send is a direct GHL call
    // in the recipe handler, not an agent tool.
    enabledTools: [],
  },
  // No specific voice — voice is set at the GHL Voice AI agent layer, not
  // here. The recipe runner only handles the post-call summary.
  monthlySpendCapMicros: 5_000_000, // $5/month default cap
  rateLimitPerHour: 60,
};
