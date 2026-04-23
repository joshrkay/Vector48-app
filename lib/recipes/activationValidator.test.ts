import { describe, expect, it } from "vitest";

import { getRecipeDefinitionOrThrow } from "./activationValidator";

describe("getRecipeDefinitionOrThrow", () => {
  it("returns a released (GA) recipe", () => {
    const recipe = getRecipeDefinitionOrThrow("missed-call-text-back");
    expect(recipe).not.toBeNull();
    expect(recipe?.slug).toBe("missed-call-text-back");
  });

  it("returns null for an unknown slug so the caller can 404", () => {
    const recipe = getRecipeDefinitionOrThrow("not-a-real-recipe");
    expect(recipe).toBeNull();
  });

  it("refuses to return a coming_soon recipe — the API must not activate it", () => {
    // `seasonal-campaign` is flagged releasePhase: "coming_soon" in the catalog.
    // Returning it would let a hand-crafted POST to /api/recipes/activate
    // sidestep the UI gate and flip status='active' on an unsupported slug.
    const recipe = getRecipeDefinitionOrThrow("seasonal-campaign");
    expect(recipe).toBeNull();
  });
});
