import { describe, expect, it } from "vitest";

import { getRecipeEngine } from "@/lib/recipes/engineRegistry";

import {
  BLOCKED_AGENT_SDK_ACTIVATION_POLICIES,
  getAgentSdkActivationBlockPolicy,
} from "./activationBlocks";
import { AGENT_SDK_RECIPE_SLUGS } from "./archetypes";
import { LAUNCH_ENABLED_AGENT_SDK_SLUGS } from "./launchEnabledAgentSdkSlugs";

describe("Agent SDK launch registry parity", () => {
  it("requires every launch-enabled Agent SDK slug to have an archetype or explicit block policy", () => {
    const uncovered = LAUNCH_ENABLED_AGENT_SDK_SLUGS.filter((slug) => {
      const hasArchetype = AGENT_SDK_RECIPE_SLUGS.includes(slug);
      const hasBlock = !!getAgentSdkActivationBlockPolicy(slug);
      return !hasArchetype && !hasBlock;
    });

    expect(uncovered).toEqual([]);
  });

  it("requires block policies to target launch-enabled Agent SDK slugs without archetypes", () => {
    for (const slug of Object.keys(BLOCKED_AGENT_SDK_ACTIVATION_POLICIES)) {
      expect(LAUNCH_ENABLED_AGENT_SDK_SLUGS).toContain(slug);
      expect(getRecipeEngine(slug)).toBe("agent-sdk");
      expect(AGENT_SDK_RECIPE_SLUGS).not.toContain(slug);
    }
  });

  it("requires blocked-slug UX to include a user-facing action", () => {
    for (const [slug, policy] of Object.entries(
      BLOCKED_AGENT_SDK_ACTIVATION_POLICIES,
    )) {
      expect(policy.message.trim().length).toBeGreaterThan(10);
      expect(policy.action.trim().length).toBeGreaterThan(10);
      expect(policy.status).toBeGreaterThanOrEqual(400);
      expect(policy.status).toBeLessThan(500);
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
