import type { Database } from "@/lib/supabase/types";

export type FunnelStage =
  | "awareness"
  | "capture"
  | "nurture"
  | "close"
  | "delight";

export type ReleasePhase = "ga" | "coming_soon";

export type Vertical = Database["public"]["Tables"]["accounts"]["Row"]["vertical"];

export interface RecipeCatalogEntry {
  slug: string;
  name: string;
  description: string;
  icon: string;
  funnelStage: FunnelStage;
  vertical: Vertical | null;
  releasePhase: ReleasePhase;
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
