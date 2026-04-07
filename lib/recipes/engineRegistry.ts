// ---------------------------------------------------------------------------
// Recipe Engine Registry
// Maps each recipe slug to its execution engine: "n8n" (external workflow)
// or "ghl-native" (direct GHL API calls, no external orchestrator).
// ---------------------------------------------------------------------------

export type RecipeEngine = "n8n" | "ghl-native";

/**
 * Recipes with existing n8n workflow templates stay on n8n.
 * All others use the GHL-native executor (direct SMS via GHL API).
 */
const ENGINE_MAP: Record<string, RecipeEngine> = {
  // ── n8n (have workflow templates or need external AI) ───────────────────
  "ai-phone-answering": "n8n",
  "missed-call-text-back": "n8n",
  "review-request": "n8n",
  "estimate-follow-up": "n8n",
  "appointment-reminder": "n8n",
  "lead-qualification": "n8n", // requires AI conversation

  // ── GHL-native (direct SMS via GHL API) ─────────────────────────────────
  "google-review-booster": "ghl-native",
  "new-lead-instant-response": "ghl-native",
  "seasonal-demand-outreach": "ghl-native",
  "tech-on-the-way": "ghl-native",
  "post-job-upsell": "ghl-native",
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
