// ---------------------------------------------------------------------------
// Recipe Engine Registry
// Maps each recipe slug to its execution engine: "n8n" (external workflow),
// "agent-sdk" (Agent SDK handler), or "ghl-native" (direct GHL API calls).
// ---------------------------------------------------------------------------

export type RecipeEngine = "n8n" | "agent-sdk" | "ghl-native";

/**
 * Recipes with existing n8n workflow templates stay on n8n.
 * Recipes migrated to Agent SDK use "agent-sdk".
 * All others use the GHL-native executor (direct SMS via GHL API).
 */
const ENGINE_MAP: Record<string, RecipeEngine> = {
  // ── Agent SDK (implemented handlers) ────────────────────────────────────────
  "ai-phone-answering": "agent-sdk",
  "missed-call-text-back": "agent-sdk",
  "review-request": "agent-sdk",
  "estimate-follow-up": "agent-sdk",
  "appointment-reminder": "agent-sdk",
  "new-lead-instant-response": "agent-sdk",
  "google-review-booster": "agent-sdk",
  "tech-on-the-way": "agent-sdk",
  "post-job-upsell": "agent-sdk",

  // ── n8n (workflow templates, no handler yet) ───────────────────────────────
  "lead-qualification": "n8n", // requires AI conversation

  // ── GHL-native (direct SMS via GHL API) ─────────────────────────────────
  "seasonal-demand-outreach": "ghl-native",
  "maintenance-plan-enrollment": "ghl-native",
  "customer-reactivation": "ghl-native",
  "unsold-estimate-reactivation": "ghl-native",
  "weather-event-outreach": "ghl-native",
};

export function getRecipeEngine(recipeSlug: string): RecipeEngine {
  return ENGINE_MAP[recipeSlug] ?? "n8n";
}

export function isGhlNative(recipeSlug: string): boolean {
  return getRecipeEngine(recipeSlug) === "ghl-native";
}

/** All recipe slugs that use the GHL-native engine. */
export const GHL_NATIVE_SLUGS = Object.entries(ENGINE_MAP)
  .filter(([, engine]) => engine === "ghl-native")
  .map(([slug]) => slug);

/** All recipe slugs that use the n8n engine. */
export const N8N_SLUGS = Object.entries(ENGINE_MAP)
  .filter(([, engine]) => engine === "n8n")
  .map(([slug]) => slug);
