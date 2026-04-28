import type { RecipeDefinition, FunnelStage } from "@/types/recipes";
import type { RecipeEngine } from "@/lib/recipes/engineRegistry";
import type { RecipeActivationState } from "@/lib/recipes/activationStateRegistry";
import type { Database } from "@/lib/supabase/types";

export type { FunnelStage };

export type Vertical = Database["public"]["Tables"]["accounts"]["Row"]["vertical"];

export type RecipeStatus = "active" | "paused" | "error" | "available" | "coming_soon";

export interface RecipeWithStatus extends RecipeDefinition {
  status: RecipeStatus;
  engine: RecipeEngine;
  activationState: RecipeActivationState;
  gateReason: string | null;
  lastTriggeredAt: string | null;
  activationId: string | null;
  config: Record<string, unknown> | null;
}

export type RecipeActivationRow =
  Database["public"]["Tables"]["recipe_activations"]["Row"];

/** Alias for backward compatibility — catalog entries use the full definition. */
export type RecipeCatalogEntry = RecipeDefinition;
