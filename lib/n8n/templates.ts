import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** recipe_slug → filename under lib/n8n/templates/ */
export const RECIPE_TEMPLATE_FILES: Record<string, string> = {
  "ai-phone-answering": "ai-phone-answering.json",
};

export function loadTemplateRaw(recipeSlug: string): string {
  const file = RECIPE_TEMPLATE_FILES[recipeSlug];
  if (!file) {
    throw new Error(`No N8N template for recipe: ${recipeSlug}`);
  }
  const path = join(process.cwd(), "lib", "n8n", "templates", file);
  return readFileSync(path, "utf8");
}

/**
 * Parsed workflow JSON (still contains {{placeholders}} inside string values).
 * Prefer loadTemplateRaw + injectVariables for provisioning.
 */
export function loadTemplate(recipeSlug: string): unknown {
  return JSON.parse(loadTemplateRaw(recipeSlug)) as unknown;
}
