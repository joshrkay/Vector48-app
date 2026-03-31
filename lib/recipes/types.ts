import type { RecipeDefinition, RecipeWithStatus } from "@/types/recipes";
import type { Database } from "@/lib/supabase/types";

export type { RecipeDefinition, RecipeWithStatus };

export type RecipeCatalogEntry = RecipeDefinition;

export type Vertical = Database["public"]["Tables"]["accounts"]["Row"]["vertical"];

export type RecipeStatus = RecipeWithStatus["activationStatus"];

export type RecipeActivationRow =
  Database["public"]["Tables"]["recipe_activations"]["Row"];
