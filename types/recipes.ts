// ---------------------------------------------------------------------------
// Recipe Catalog — Type Definitions
// Shared types for the static recipe catalog, activation state, and merge layer.
// ---------------------------------------------------------------------------

// ── Verticals ──────────────────────────────────────────────────────────────

export type Vertical =
  | "hvac"
  | "plumbing"
  | "electrical"
  | "roofing"
  | "landscaping";

// ── Funnel Stages ──────────────────────────────────────────────────────────

export type FunnelStage =
  | "awareness"
  | "capture"
  | "engage"
  | "close"
  | "deliver"
  | "retain"
  | "reactivate";

export const FUNNEL_STAGE_META: Record<
  FunnelStage,
  { label: string; color: string }
> = {
  awareness: { label: "Awareness", color: "sky-100" },
  capture: { label: "Capture", color: "blue-100" },
  engage: { label: "Engage", color: "violet-100" },
  close: { label: "Close", color: "amber-100" },
  deliver: { label: "Deliver", color: "green-100" },
  retain: { label: "Retain", color: "rose-100" },
  reactivate: { label: "Reactivate", color: "orange-100" },
} as const;

// ── Release Phases ─────────────────────────────────────────────────────────

export type ReleasePhase = "ga" | "coming_soon" | "v1" | "v2" | "v3";

// ── Config Fields (drives the activation form UI) ──────────────────────────

export type ConfigFieldType =
  | "text"
  | "number"
  | "boolean"
  | "toggle"
  | "phone"
  | "select"
  | "textarea";

export interface RecipeConfigField {
  name: string;
  label: string;
  type: ConfigFieldType;
  required: boolean;
  /** Key in the accounts row to pre-fill from (e.g. 'phone', 'voice_gender') */
  defaultFromProfile?: string;
  /** Available choices for 'select' type fields */
  options?: string[];
}

// ── Recipe Definition (static catalog entry) ───────────────────────────────

export interface RecipeDefinition {
  slug: string;
  name: string;
  description: string;
  detailedDescription: string;
  /** When set, used for vertical-specific recommendations in the recipe grid */
  vertical?: Vertical | null;
  funnelStage: FunnelStage;
  releasePhase: ReleasePhase;
  /** Lucide icon name (resolved to component in the UI layer) */
  icon: string;
  /** Tailwind color class for the icon tile background (e.g. 'blue-100') */
  stageColor: string;
  trigger: string;
  output: string;
  requiredIntegrations: string[];
  optionalIntegrations: string[];
  configFields: RecipeConfigField[];
  /** Sample customer-facing message per vertical */
  verticalMessages: Record<Vertical, string>;
  estimatedROI: string;
}

// ── Activation Status ──────────────────────────────────────────────────────
// DB enum includes 'deactivated' for explicit deprovision; UI may still derive
// "deactivated" when no row exists for a recipe.

export type RecipeActivationStatus =
  | "active"
  | "paused"
  | "error"
  | "deactivated";

// ── Recipe Activation (maps to recipe_activations DB row) ──────────────────

/** DB-aligned status */
export type RecipeActivationDbStatus =
  | "active"
  | "paused"
  | "error"
  | "deactivated";

export interface RecipeActivation {
  id: string;
  accountId: string;
  recipeSlug: string;
  status: RecipeActivationDbStatus;
  config: Record<string, unknown> | null;
  n8nWorkflowId: string | null;
  activatedAt: string;
  lastTriggeredAt: string | null;
}

// ── Merged view for the marketplace UI ─────────────────────────────────────

export type RecipeWithStatus = RecipeDefinition & {
  activationStatus?: RecipeActivationStatus;
  lastTriggeredAt?: string;
  config?: Record<string, unknown>;
};
