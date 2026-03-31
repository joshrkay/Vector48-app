import type { RecipeDefinition, FunnelStage } from "@/types/recipes";
import type { Database } from "@/lib/supabase/types";
import type { RecipeDefinition } from "@/types/recipes";

export type { FunnelStage };

export type Vertical = Database["public"]["Tables"]["accounts"]["Row"]["vertical"];
export type { RecipeDefinition as RecipeCatalogEntry };

export type RecipeStatus = "active" | "paused" | "available" | "coming_soon";

export interface RecipeWithStatus extends RecipeDefinition {
  status: RecipeStatus;
  lastTriggeredAt: string | null;
  activationId: string | null;
  config: Record<string, unknown> | null;
}

export type RecipeActivationRow =
  Database["public"]["Tables"]["recipe_activations"]["Row"];

/** Alias for backward compatibility — catalog entries use the full definition. */
export type RecipeCatalogEntry = RecipeDefinition;
