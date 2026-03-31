import type { RecipeDefinition, FunnelStage } from "@/types/recipes";
import type { Database } from "@/lib/supabase/types";
import type { RecipeDefinition, RecipeWithStatus } from "@/types/recipes";

export type { RecipeDefinition as RecipeCatalogEntry, RecipeWithStatus };

export type Vertical = Database["public"]["Tables"]["accounts"]["Row"]["vertical"];

export type RecipeStatus = RecipeWithStatus["activationStatus"];

export type RecipeActivationRow =
  Database["public"]["Tables"]["recipe_activations"]["Row"];

/** Alias for backward compatibility — catalog entries use the full definition. */
export type RecipeCatalogEntry = RecipeDefinition;
