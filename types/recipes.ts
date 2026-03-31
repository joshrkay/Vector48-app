export type Vertical =
  | "hvac"
  | "plumbing"
  | "electrical"
  | "roofing"
  | "landscaping";

export type FunnelStage =
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
  capture: { label: "Capture", color: "blue-100" },
  engage: { label: "Engage", color: "violet-100" },
  close: { label: "Close", color: "amber-100" },
  deliver: { label: "Deliver", color: "green-100" },
  retain: { label: "Retain", color: "rose-100" },
  reactivate: { label: "Reactivate", color: "orange-100" },
} as const;

export type ReleasePhase = "v1" | "v2" | "v3";

export type RecipeActivationStatus =
  | "active"
  | "paused"
  | "error"
  | "deactivated";

export type ConfigFieldType =
  | "text"
  | "phone"
  | "select"
  | "toggle"
  | "textarea"
  | "number"
  | "boolean";

export interface ConfigFieldOption {
  value: string;
  label: string;
}

export interface RecipeConfigField {
  name: string;
  label: string;
  type: ConfigFieldType;
  required: boolean;
  defaultFromProfile?: string;
  defaultValue?: string | boolean | number;
  helpText?: string;
  options?: ConfigFieldOption[] | string[];
}

export interface RecipeDefinition {
  slug: string;
  name: string;
  description: string;
  detailedDescription: string;
  funnelStage: FunnelStage;
  releasePhase: ReleasePhase;
  marketplaceListing: "available" | "coming_soon";
  icon: string;
  trigger: string;
  output: string;
  estimatedROI: string;
  requiredIntegrations: string[];
  optionalIntegrations: string[];
  configFields: RecipeConfigField[];
  verticalMessages: Record<Vertical, string>;
  vertical?: Vertical | null;
}

export interface RecipeActivation {
  id: string;
  account_id: string;
  recipe_slug: string;
  status: RecipeActivationStatus;
  config: Record<string, unknown> | null;
  n8n_workflow_id: string | null;
  activated_at: string;
  last_triggered_at: string | null;
  deactivated_at: string | null;
  error_message: string | null;
}

export interface RecipeWithStatus extends RecipeDefinition {
  activationStatus: RecipeActivationStatus | "available" | "coming_soon";
  activation?: RecipeActivation;
  lastTriggeredAt?: string | null;
  config?: Record<string, unknown>;
}

export interface RecipeContactStatus {
  slug: string;
  name: string;
  status: RecipeActivationStatus;
  lastAction?: string;
  lastActionAt?: string;
  isPaused?: boolean;
}
