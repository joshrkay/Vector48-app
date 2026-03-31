import type { Database } from "@/lib/supabase/types";
import type { RecipeConfigField, Vertical as RichVertical } from "@/types/recipes";

export type FunnelStage =
  | "awareness"
  | "capture"
  | "nurture"
  | "close"
  | "delight"
  | "engage"
  | "deliver"
  | "retain"
  | "reactivate";

export type ReleasePhase = "ga" | "coming_soon" | "v1" | "v2" | "v3";

export type Vertical = Database["public"]["Tables"]["accounts"]["Row"]["vertical"];

export interface RecipeCatalogEntry {
  slug: string;
  name: string;
  description: string;
  icon: string;
  funnelStage: FunnelStage;
  vertical?: Vertical | null;
  releasePhase: ReleasePhase;
  // Optional rich fields (present on fully-specified recipes)
  detailedDescription?: string;
  stageColor?: string;
  trigger?: string;
  output?: string;
  requiredIntegrations?: string[];
  optionalIntegrations?: string[];
  configFields?: RecipeConfigField[];
  verticalMessages?: Record<RichVertical, string>;
  estimatedROI?: string;
}

export type RecipeStatus = "active" | "paused" | "available" | "coming_soon";

export interface RecipeWithStatus extends RecipeCatalogEntry {
  status: RecipeStatus;
  lastTriggeredAt: string | null;
  activationId: string | null;
  config: Record<string, unknown> | null;
}

export type RecipeActivationRow =
  Database["public"]["Tables"]["recipe_activations"]["Row"];
