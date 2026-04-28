import { describe, expect, it } from "vitest";
import { RECIPE_CATALOG } from "@/lib/recipes/catalog";
import {
  getCatalogReconciliationTable,
  getRecipeActivationState,
} from "@/lib/recipes/activationStateRegistry";

describe("activationStateRegistry", () => {
  it("declares an activation state for every catalog slug", () => {
    const missing = RECIPE_CATALOG.map((r) => r.slug).filter(
      (slug) => getRecipeActivationState(slug) == null,
    );

    expect(missing).toEqual([]);
  });

  it("contains no reconciliation rows for unknown catalog slugs", () => {
    const catalogSlugs = new Set(RECIPE_CATALOG.map((r) => r.slug));
    const unknown = getCatalogReconciliationTable()
      .map((row) => row.slug)
      .filter((slug) => !catalogSlugs.has(slug));

    expect(unknown).toEqual([]);
  });

  it("keeps state/engine/archetype contracts coherent", () => {
    const table = getCatalogReconciliationTable();

    for (const row of table) {
      if (row.state === "fully_launchable") {
        expect(row.engine).toBe("agent-sdk");
        expect(row.hasArchetype).toBe(true);
      }

      if (row.state === "legacy_engine_only") {
        expect(row.engine === "n8n" || row.engine === "ghl-native").toBe(true);
      }

      if (row.state === "gated") {
        expect(row.gateReason?.trim().length ?? 0).toBeGreaterThan(0);
      }
    }
  });
});
