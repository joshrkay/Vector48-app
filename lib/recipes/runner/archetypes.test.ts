// ---------------------------------------------------------------------------
// Registry-level invariants for the archetype system.
//
// Guards:
//   - Every registered archetype has a slug that matches a catalog entry
//   - Every registered archetype has a runtime handler wired in RECIPE_HANDLERS
//   - All 16 catalog recipes have an archetype (was 6/16 before BUG-4 fix)
//   - resolveSystemPrompt substitutes all documented placeholders
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RECIPE_CATALOG } from "../catalog.ts";
import {
  AGENT_SDK_RECIPE_SLUGS,
  getArchetype,
  listArchetypes,
  resolveSystemPrompt,
} from "./archetypes.ts";
import { RECIPE_HANDLERS } from "./index.ts";

describe("archetype registry", () => {
  it("covers every recipe in the catalog", () => {
    const catalogSlugs = new Set(RECIPE_CATALOG.map((r) => r.slug));
    const missing: string[] = [];
    for (const slug of catalogSlugs) {
      if (!getArchetype(slug)) missing.push(slug);
    }
    assert.deepEqual(missing, [], `Missing archetypes: ${missing.join(", ")}`);
  });

  it("has a runtime handler for every registered archetype", () => {
    const orphaned: string[] = [];
    for (const slug of AGENT_SDK_RECIPE_SLUGS) {
      if (!RECIPE_HANDLERS[slug]) orphaned.push(slug);
    }
    assert.deepEqual(
      orphaned,
      [],
      `Archetypes without handlers: ${orphaned.join(", ")}`,
    );
  });

  it("defines a spend cap and rate limit for every archetype", () => {
    for (const archetype of listArchetypes()) {
      assert.ok(
        archetype.monthlySpendCapMicros === null ||
          archetype.monthlySpendCapMicros > 0,
        `${archetype.slug}: invalid monthlySpendCapMicros`,
      );
      assert.ok(
        archetype.rateLimitPerHour === null || archetype.rateLimitPerHour > 0,
        `${archetype.slug}: invalid rateLimitPerHour`,
      );
    }
  });

  it("archetype slugs are unique", () => {
    const slugs = listArchetypes().map((a) => a.slug);
    assert.equal(new Set(slugs).size, slugs.length);
  });
});

describe("resolveSystemPrompt", () => {
  it("substitutes all documented placeholders", () => {
    const resolved = resolveSystemPrompt(
      "Hi from {{business_name}}, a {{vertical}} shop. Greeting: {{greeting_name}}.",
      {
        business_name: "Acme HVAC",
        vertical: "hvac",
        greeting_name: "the Acme team",
      },
    );
    assert.equal(
      resolved,
      "Hi from Acme HVAC, a hvac shop. Greeting: the Acme team.",
    );
  });

  it("falls back when fields are null", () => {
    const resolved = resolveSystemPrompt(
      "{{business_name}} / {{vertical}} / {{greeting_name}}",
      { business_name: null, vertical: null, greeting_name: null },
    );
    // business_name → "the business", vertical → "home services",
    // greeting_name → greeting_name ?? business_name ?? "the team" → "the team"
    assert.equal(resolved, "the business / home services / the team");
  });

  it("greeting_name falls through to business_name when only greeting_name is null", () => {
    const resolved = resolveSystemPrompt(
      "{{greeting_name}}",
      { business_name: "Acme", vertical: "hvac", greeting_name: null },
    );
    assert.equal(resolved, "Acme");
  });

  it("replaces every occurrence, not just the first", () => {
    const resolved = resolveSystemPrompt(
      "{{business_name}} | {{business_name}} | {{business_name}}",
      { business_name: "Acme", vertical: null, greeting_name: null },
    );
    assert.equal(resolved, "Acme | Acme | Acme");
  });
});
