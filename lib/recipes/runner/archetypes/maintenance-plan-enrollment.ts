// ---------------------------------------------------------------------------
// Archetype: Maintenance Plan Enrollment
//
// Triggered N days after a completed service for customers not already on a
// plan. Pitches the maintenance plan's benefits with a one-tap sign-up link.
// ---------------------------------------------------------------------------

import type { RecipeArchetype } from "../archetypes";

export const maintenancePlanEnrollmentArchetype: RecipeArchetype = {
  slug: "maintenance-plan-enrollment",
  displayName: "Maintenance Plan Enrollment",
  systemPrompt:
    "You write concise maintenance-plan invitation SMS for {{business_name}}, " +
    "a {{vertical}} company. The runner supplies the plan link via " +
    "{{maintenance_plan_link}}. Constraints: " +
    "(1) under 320 characters, " +
    "(2) highlight two concrete benefits (priority scheduling, discounted repairs, annual inspection — pick two), " +
    "(3) include the {{maintenance_plan_link}} token, " +
    "(4) keep it friendly, not corporate, " +
    "(5) no emojis, " +
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
