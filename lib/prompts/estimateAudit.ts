import type { Database } from "@/lib/supabase/types";

export type EstimateAuditVertical =
  Database["public"]["Enums"]["vertical"];

const VERTICAL_DISPLAY: Record<EstimateAuditVertical, string> = {
  hvac: "HVAC",
  plumbing: "Plumbing",
  electrical: "Electrical",
  roofing: "Roofing",
  landscaping: "Landscaping",
};

function verticalKnowledge(vertical: EstimateAuditVertical): string {
  switch (vertical) {
    case "hvac":
      return `Common missed or upsell line items for HVAC:
- Surge protector / whole-home or condenser surge protection
- Condensate line / drain pan / safety switch
- Thermostat upgrade (programmable, Wi‑Fi, zoning prep)
- Line set protection, UV / air quality add-ons where appropriate
- Permit and disposal fees if absent
- Extended labor or maintenance plan`;
    case "plumbing":
      return `Common missed or upsell line items for Plumbing:
- Water pressure test (static and dynamic where relevant)
- Main or fixture shut-off valve replacement
- Expansion tank (water heater contexts)
- Code updates (PRV, backflow, bonding)
- Access restoration / drywall patch line
- Warranty or service agreement`;
    case "electrical":
      return `Common missed or upsell line items for Electrical:
- Panel labeling, AFCI/GFCI upgrades to meet current code
- Surge protection (whole-home or at main)
- Permit and inspection fees
- Trenching / conduit / derating where applicable
- Smart load management or EV prep (if job scope allows)`;
    case "roofing":
      return `Common missed or upsell line items for Roofing:
- Drip edge, starter strip, ice and water shield in valleys/eaves
- Ridge vent / balanced attic ventilation
- Flashing details (chimney, wall, skylight)
- Decking repair or replacement if not scoped
- Cleanup, magnet sweep, disposal`;
    case "landscaping":
      return `Common missed or upsell line items for Landscaping / outdoor:
- Soil amendment, irrigation tie-in or clock
- Drainage / grading, erosion control
- Mulch, edging, warranty on plantings
- Access protection (mats, restoration of turf)
- Seasonal maintenance package`;
    default: {
      const _exhaustive: never = vertical;
      return _exhaustive;
    }
  }
}

/**
 * Claude system prompt for estimate audit. Model must return a single JSON object only.
 */
export function buildEstimateAuditSystemPrompt(
  vertical: EstimateAuditVertical,
): string {
  const label = VERTICAL_DISPLAY[vertical];
  const knowledge = verticalKnowledge(vertical);

  return `You are an expert estimator for ${label} home-service businesses. You help owners review estimates before they are sent to customers.

Your job is to analyze the estimate text the user provides and identify:
1. Commonly missed line items or scope gaps for the stated job type and trade.
2. Reasonable upsell opportunities (maintenance plans, protection items, code-adjacent upgrades) when they fit the job — be helpful, not pushy.
3. Pricing sanity: flag line items or totals that appear significantly below or above typical market bands for residential work in the US. You do not know the customer's exact region — say "typical market range" and stay tentative.

Tone: professional, supportive, and concise. Frame everything as suggestions the owner can consider, not demands.

Trade-specific reference (use as guidance, not a checklist to spam every item):
${knowledge}

Output rules (critical):
- Respond with ONE JSON object only. No markdown, no code fences, no preamble, no text before or after the JSON.
- Use this exact shape (numbers are US dollars, not cents):
{"suggestions":[{"item":"string","reason":"string","estimatedValue":0}],"totalPotentialValue":0}
- "item": short title for the suggestion.
- "reason": 1–3 sentences explaining why it matters; mention pricing sanity here if relevant.
- "estimatedValue": your best guess at incremental revenue or value for that suggestion in USD (integer or decimal). If unsure, give a conservative round number and keep the reason honest.
- "totalPotentialValue": must equal the sum of all "estimatedValue" in "suggestions" (after rounding to two decimal places if needed).
- If the estimate text is empty or unusable, return {"suggestions":[],"totalPotentialValue":0}.
- Produce roughly 5–10 suggestions when the estimate has enough detail; fewer is fine if the document is thin.`;
}

export function verticalToDisplayLabel(
  vertical: EstimateAuditVertical,
): string {
  return VERTICAL_DISPLAY[vertical];
}
