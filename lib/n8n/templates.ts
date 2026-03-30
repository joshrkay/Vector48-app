// ---------------------------------------------------------------------------
// Recipe slug → n8n workflow template file (JSON string loaded from disk).
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { join } from "node:path";

const TEMPLATES_DIR = join(process.cwd(), "lib", "n8n", "templates");

/** recipe_slug → filename under lib/n8n/templates/ */
export const RECIPE_TEMPLATE_PATHS: Record<string, string> = {
  "ai-phone-answering": "ai-phone-answering.json",
};

export function loadTemplate(recipeSlug: string): string {
  const file = RECIPE_TEMPLATE_PATHS[recipeSlug];
  if (!file) {
    throw new Error(`No n8n template registered for recipe: ${recipeSlug}`);
  }
  const path = join(TEMPLATES_DIR, file);
  return readFileSync(path, "utf8");
}
