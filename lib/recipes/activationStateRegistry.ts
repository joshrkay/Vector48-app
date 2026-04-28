import { RECIPE_CATALOG } from "@/lib/recipes/catalog";
import { getRecipeEngine, type RecipeEngine } from "@/lib/recipes/engineRegistry";
import { AGENT_SDK_RECIPE_SLUGS } from "@/lib/recipes/runner/archetypes";

export type RecipeActivationState =
  | "fully_launchable"
  | "gated"
  | "legacy_engine_only";

export interface RecipeReconciliationRow {
  slug: string;
  state: RecipeActivationState;
  gateReason?: string;
}

const RECONCILIATION_ROWS: RecipeReconciliationRow[] = [
  // Fully launchable (Agent SDK activation path + runtime handler)
  { slug: "ai-phone-answering", state: "fully_launchable" },
  { slug: "missed-call-text-back", state: "fully_launchable" },
  { slug: "estimate-follow-up", state: "fully_launchable" },
  { slug: "appointment-reminder", state: "fully_launchable" },
  { slug: "review-request", state: "fully_launchable" },
  {
    slug: "google-review-booster",
    state: "gated",
    gateReason: "Temporarily gated until launch path is finalized",
  },

  // Available in catalog but intentionally not activatable yet
  { slug: "seasonal-campaign", state: "gated", gateReason: "Coming soon" },
  {
    slug: "new-lead-instant-response",
    state: "gated",
    gateReason: "Temporarily gated until launch path is finalized",
  },
  {
    slug: "tech-on-the-way",
    state: "gated",
    gateReason: "Temporarily gated until launch path is finalized",
  },
  {
    slug: "post-job-upsell",
    state: "gated",
    gateReason: "Temporarily gated until launch path is finalized",
  },

  // Legacy engine only (n8n / GHL-native)
  { slug: "lead-qualification", state: "legacy_engine_only" },
  { slug: "seasonal-demand-outreach", state: "legacy_engine_only" },
  { slug: "maintenance-plan-enrollment", state: "legacy_engine_only" },
  { slug: "customer-reactivation", state: "legacy_engine_only" },
  { slug: "unsold-estimate-reactivation", state: "legacy_engine_only" },
  { slug: "weather-event-outreach", state: "legacy_engine_only" },
];

const ROWS_BY_SLUG = new Map(RECONCILIATION_ROWS.map((row) => [row.slug, row]));

export function getRecipeReconciliation(slug: string): RecipeReconciliationRow | null {
  return ROWS_BY_SLUG.get(slug) ?? null;
}

export function getRecipeActivationState(slug: string): RecipeActivationState | null {
  return getRecipeReconciliation(slug)?.state ?? null;
}

export function isRecipeGated(slug: string): boolean {
  return getRecipeActivationState(slug) === "gated";
}

export function getRecipeGateReason(slug: string): string | null {
  return getRecipeReconciliation(slug)?.gateReason ?? null;
}

export interface RecipeCatalogReconciliationRow extends RecipeReconciliationRow {
  engine: RecipeEngine;
  hasArchetype: boolean;
}

export function getCatalogReconciliationTable(): RecipeCatalogReconciliationRow[] {
  return RECIPE_CATALOG.map((recipe) => {
    const row = getRecipeReconciliation(recipe.slug);
    return {
      slug: recipe.slug,
      state: row?.state ?? "gated",
      gateReason: row?.gateReason,
      engine: getRecipeEngine(recipe.slug),
      hasArchetype: AGENT_SDK_RECIPE_SLUGS.includes(recipe.slug),
    };
  });
}

export const RECIPE_RECONCILIATION_ROWS = RECONCILIATION_ROWS;
