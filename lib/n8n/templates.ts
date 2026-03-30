// ---------------------------------------------------------------------------
// Recipe slug → n8n workflow template file (JSON string loaded from disk).
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { RECIPE_TEMPLATE_PATHS } from "./recipeTemplateRegistry";

const TEMPLATES_DIR = join(process.cwd(), "lib", "n8n", "templates");

export { RECIPE_TEMPLATE_PATHS };

export function loadTemplate(recipeSlug: string): string {
  const file = RECIPE_TEMPLATE_PATHS[recipeSlug];
  if (!file) {
    throw new Error(`No n8n template registered for recipe: ${recipeSlug}`);
  }
  const path = join(TEMPLATES_DIR, file);
  return readFileSync(path, "utf8");
}
