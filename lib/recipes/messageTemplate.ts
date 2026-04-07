// ---------------------------------------------------------------------------
// Message template resolution and interpolation for recipe execution.
// Pure functions — safe to import in both server and test contexts.
// ---------------------------------------------------------------------------

import { RECIPE_CATALOG } from "@/lib/recipes/catalog";
import type { Vertical } from "@/types/recipes";

export interface MergeFields {
  contact_name?: string;
  business_name?: string;
  appointment_time?: string;
  tech_name?: string;
  eta?: string;
  review_link?: string;
  weather_event?: string;
  [key: string]: string | undefined;
}

/** Config keys that different recipes use for custom message overrides. */
const MESSAGE_CONFIG_KEYS = [
  "responseMessage",
  "seasonalMessage",
  "onTheWayMessage",
  "upsellMessage",
  "maintenancePlanMessage",
  "reactivationMessage",
  "weatherMessage",
  "reviewRequestMessage",
];

/**
 * Resolve the SMS body for a recipe execution.
 * Priority: activation config override → vertical template → HVAC fallback.
 */
export function resolveMessageTemplate(
  recipeSlug: string,
  vertical: Vertical | string | null | undefined,
  config: Record<string, unknown>,
): string | null {
  for (const key of MESSAGE_CONFIG_KEYS) {
    if (typeof config[key] === "string" && config[key]) {
      return config[key] as string;
    }
  }

  const recipe = RECIPE_CATALOG.find((r) => r.slug === recipeSlug);
  if (!recipe) return null;

  const v = vertical as Vertical;
  if (v && recipe.verticalMessages[v]) {
    return recipe.verticalMessages[v];
  }

  return recipe.verticalMessages.hvac ?? null;
}

/**
 * Interpolate merge fields like {{contact_name}} into a message template.
 */
export function interpolateMessage(
  template: string,
  fields: MergeFields,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return fields[key] ?? "";
  });
}
