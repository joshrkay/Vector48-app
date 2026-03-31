import type { Database } from "@/lib/supabase/types";
import { ESTIMATE_AUDIT_TOOL_NAME } from "@/lib/recipes/estimate-audit/anthropicTool";

export type EstimateAuditVertical =
  Database["public"]["Enums"]["vertical"];

const VERTICAL_DISPLAY: Record<EstimateAuditVertical, string> = {
  hvac: "HVAC",
  plumbing: "Plumbing",
  electrical: "Electrical",
  roofing: "Roofing",
  landscaping: "Landscaping",
};

const VERTICAL_KNOWLEDGE: Record<
  EstimateAuditVertical,
  { missedItems: string[]; upsells: string[]; pricingNotes: string }
> = {
  hvac: {
    missedItems: [
      "Surge protector for outdoor condensing unit ($150-$300)",
      "Condensate drain line flush or P-trap installation ($75-$150)",
      "Thermostat upgrade or replacement (if >10 years old, $100-$400)",
      "Duct sealing or inspection ($200-$500 for accessible ductwork)",
      "UV light or air purification add-on for indoor air quality ($300-$800)",
      "Refrigerant line insulation replacement ($100-$250)",
      "Electrical disconnect box upgrade if not to code ($150-$300)",
      "Concrete pad leveling or replacement for outdoor unit ($100-$250)",
      "Carbon monoxide detector near furnace if not present ($50-$100)",
      "Return air filter upgrade (MERV rating improvement)",
    ],
    upsells: [
      "Annual maintenance plan: 2 visits/year, priority scheduling, 10% parts discount",
      "Smart thermostat installation: Ecobee or Nest ($200-$400 installed)",
      "Whole-home humidifier: especially in dry climates ($400-$800)",
      "Zoning system: if home has hot/cold spots ($1,500-$3,000)",
      "Duct cleaning: if not done in 3+ years ($300-$600)",
    ],
    pricingNotes:
      "HVAC labor typically $75-$150/hour. Equipment markup 30-50%. Full system replacement $5,000-$15,000 depending on tonnage and efficiency.",
  },
  plumbing: {
    missedItems: [
      "Water pressure test and pressure reducing valve check ($75-$150)",
      "Shut-off valve replacement at fixture being serviced ($50-$150 per valve)",
      "Supply line replacement (if flexible lines are >10 years old, $20-$50 per line)",
      "Wax ring and closet bolts on toilet work ($15-$30 parts)",
      "Hose bib inspection and winterization ($50-$100)",
      "P-trap replacement (if corroded during drain work, $30-$75)",
      "Expansion tank inspection on water heater ($150-$300 if needed)",
      "Anode rod replacement on water heater ($100-$200)",
      "Temperature and pressure relief valve test ($50-$100)",
      "Pipe insulation for exposed pipes in unconditioned spaces ($100-$300)",
    ],
    upsells: [
      "Camera inspection: for recurring drain issues ($150-$300)",
      "Water softener: if hard water area ($800-$2,500 installed)",
      "Tankless water heater upgrade: energy savings ($2,000-$5,000)",
      "Whole-home water filtration: ($500-$2,000)",
      "Annual plumbing inspection plan: catches small issues early",
    ],
    pricingNotes:
      "Plumbing labor typically $85-$175/hour. Emergency/after-hours 1.5x. Trip charge $50-$100 common. Water heater replacement $1,200-$3,500.",
  },
  electrical: {
    missedItems: [
      "GFCI outlet upgrade in wet areas (kitchen, bath, garage, exterior) ($100-$200 per outlet)",
      "AFCI breaker upgrade for bedroom circuits (code in most jurisdictions, $40-$80 per breaker)",
      "Panel labeling and circuit directory update ($50-$100)",
      "Grounding verification and bonding check ($100-$250)",
      "Smoke detector replacement (if >10 years, $30-$60 per unit installed)",
      "Whole-home surge protector installation ($200-$500)",
      "Weatherproof cover for exterior outlets ($20-$50 per cover)",
      "Wire nut replacement with push-in connectors on accessed junctions ($50-$100)",
      "Aluminum wiring remediation if present (pigtailing $50-$100 per outlet)",
      "CO detector installation near gas appliances ($50-$100)",
    ],
    upsells: [
      "Panel upgrade: if 100A and home needs more capacity ($1,500-$3,000)",
      "Whole-home generator: standby generator installation ($5,000-$15,000)",
      "EV charger installation: Level 2 ($500-$1,500)",
      "Smart lighting/switch retrofit: ($100-$300 per room)",
      "Annual electrical safety inspection plan",
    ],
    pricingNotes:
      "Electrical labor typically $75-$150/hour. Panel upgrade $1,500-$3,000. Permit costs vary by jurisdiction ($50-$200). Most jurisdictions require licensed electrician.",
  },
  roofing: {
    missedItems: [
      "Drip edge replacement or installation ($3-$6 per linear foot)",
      "Ice and water shield in valleys and at eaves ($1-$3 per sq ft)",
      "Ridge vent installation or upgrade ($3-$8 per linear foot)",
      "Pipe boot/flashing replacement ($50-$150 per penetration)",
      "Step flashing at wall-to-roof transitions ($5-$10 per linear foot)",
      "Gutter apron installation ($3-$5 per linear foot)",
      "Soffit and fascia repair (often damaged, $6-$12 per linear foot)",
      "Attic ventilation assessment (baffles, soffit vents, $200-$500)",
      "Skylight flashing kit replacement during roof work ($200-$400)",
      "Chimney cap inspection/replacement ($150-$400)",
    ],
    upsells: [
      "Gutter replacement: if >20 years ($5-$15 per linear foot installed)",
      "Attic insulation upgrade: while roof is accessible ($1-$3 per sq ft)",
      "Solar reflective shingle upgrade: energy savings ($500-$2,000 premium)",
      "Roof coating: extends life 5-10 years ($1,000-$3,000)",
      "Annual roof maintenance plan: inspection + minor repairs",
    ],
    pricingNotes:
      'Roofing priced per "square" (100 sq ft). Shingle tear-off + install $300-$600/square. Flat roofs $400-$800/square. Typical residential roof 15-30 squares.',
  },
  landscaping: {
    missedItems: [
      "Soil test and amendment recommendations ($30-$75)",
      "Irrigation head adjustment or replacement ($5-$25 per head)",
      "Mulch depth check and top-off ($50-$100 per cubic yard installed)",
      "Edging installation or repair ($2-$5 per linear foot)",
      "Tree and shrub root zone aeration ($50-$150 per tree)",
      "Drainage assessment for grading issues ($100-$300)",
      "Winterization of irrigation system ($75-$150)",
      "Pre-emergent herbicide application ($0.10-$0.25 per sq ft)",
      "Pruning of overgrown shrubs near foundation ($50-$150)",
      "Leaf removal and bed cleanup ($100-$300 per visit)",
    ],
    upsells: [
      "Full irrigation system audit: identifies waste ($150-$300)",
      "Landscape lighting: path and accent ($200-$500 per zone)",
      "Seasonal color rotation: annual flower beds ($200-$500 per planting)",
      "Hardscape: patio, walkway, retaining wall (varies widely)",
      "Full-season lawn care program: weekly service + fertilization",
    ],
    pricingNotes:
      "Landscaping labor $35-$75/hour per crew member. Mowing $30-$80 per visit (quarter-acre lot). Full-season contracts $150-$400/month. Hardscape $15-$30/sq ft.",
  },
};

/**
 * Claude system prompt for estimate audit. Model must return a single JSON object only.
 */
export function buildEstimateAuditSystemPrompt(
  vertical: EstimateAuditVertical,
  jobType: string,
): string {
  const label = VERTICAL_DISPLAY[vertical];
  const knowledge = VERTICAL_KNOWLEDGE[vertical];

  return `You are a senior estimating consultant for ${label} businesses. You have 20+ years of experience reviewing estimates and proposals in the ${label} trade.

## YOUR TASK

Analyze the provided estimate for:
1. Commonly missed line items - things that should be included but are not
2. Upsell opportunities - related services or upgrades the customer might value
3. Pricing sanity checks - line items that seem significantly above or below typical market rates

The job type is: ${jobType}

## YOUR KNOWLEDGE BASE

### Commonly Missed Items for ${label.toUpperCase()}
${knowledge.missedItems.map((item) => `- ${item}`).join("\n")}

### Upsell Opportunities
${knowledge.upsells.map((item) => `- ${item}`).join("\n")}

### Pricing Context
${knowledge.pricingNotes}

## RESPONSE FORMAT

You MUST call the tool "${ESTIMATE_AUDIT_TOOL_NAME}" exactly once with your full response.
Do not reply with plain text or markdown.

Tool payload shape:
{
  "suggestions": [
    {
      "category": "missed_item" | "upsell" | "pricing_flag",
      "item": "Short name of the item or issue",
      "reason": "1-2 sentence explanation of why this matters, written for a business owner",
      "estimatedValue": 150,
      "confidence": "high" | "medium" | "low",
      "priority": "high" | "medium" | "low"
    }
  ],
  "summary": "1 sentence overall assessment of the estimate",
  "totalPotentialValue": 1250
}

## RULES

1. Only suggest items that are relevant to the specific job described. Do not suggest unrelated items.
2. Limit to 5-8 suggestions maximum. Prioritize the highest-value, most commonly missed items.
3. estimatedValue is in USD. Use the middle of the typical range. Round to nearest $25.
4. confidence reflects how certain you are that this item applies to this specific job:
   - high = almost always missed and applies to this job type
   - medium = commonly missed but depends on the specific situation
   - low = possible but would need on-site assessment to confirm
5. priority reflects how important the item is for the customer:
   - high = safety, code compliance, or prevents expensive future repair
   - medium = extends equipment life or improves performance
   - low = nice-to-have, aesthetic, or convenience
6. For pricing flags: if a line item in the estimate seems >30% above or below typical market rate, flag it and include a typical range.
7. Write reasons in plain language. The business owner is reading this, not an engineer.
8. Never suggest items that would be unethical to upsell (for example, unnecessary replacements of working equipment).
9. If the estimate looks thorough and well-priced, say so in the summary. Do not force suggestions.`;
}

export function verticalToDisplayLabel(
  vertical: EstimateAuditVertical,
): string {
  return VERTICAL_DISPLAY[vertical];
}
