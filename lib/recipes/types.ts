import type { Database } from "@/lib/supabase/types";
import type { RecipeDefinition } from "@/types/recipes";

export type Vertical = Database["public"]["Tables"]["accounts"]["Row"]["vertical"];

export type RecipeStatus =
  | "active"
  | "paused"
  | "error"
  | "available"
  | "coming_soon";

export interface RecipeWithStatus extends RecipeDefinition {
  status: RecipeStatus;
  lastTriggeredAt: string | null;
  activationId: string | null;
  config: Record<string, unknown> | null;
}

export type RecipeActivationRow =
  Database["public"]["Tables"]["recipe_activations"]["Row"];
