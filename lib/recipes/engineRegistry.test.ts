import { describe, expect, it } from "vitest";
import {
  getRecipeEngine,
  isGhlNative,
  GHL_NATIVE_SLUGS,
  N8N_SLUGS,
} from "./engineRegistry";

describe("engineRegistry", () => {
  describe("getRecipeEngine", () => {
    it("returns 'n8n' for recipes with n8n templates", () => {
      expect(getRecipeEngine("ai-phone-answering")).toBe("n8n");
      expect(getRecipeEngine("missed-call-text-back")).toBe("n8n");
      expect(getRecipeEngine("review-request")).toBe("n8n");
      expect(getRecipeEngine("estimate-follow-up")).toBe("n8n");
      expect(getRecipeEngine("appointment-reminder")).toBe("n8n");
      expect(getRecipeEngine("lead-qualification")).toBe("n8n");
    });

    it("returns 'ghl-native' for GHL-native recipes", () => {
      expect(getRecipeEngine("google-review-booster")).toBe("ghl-native");
      expect(getRecipeEngine("new-lead-instant-response")).toBe("ghl-native");
      expect(getRecipeEngine("seasonal-demand-outreach")).toBe("ghl-native");
      expect(getRecipeEngine("tech-on-the-way")).toBe("ghl-native");
      expect(getRecipeEngine("post-job-upsell")).toBe("ghl-native");
      expect(getRecipeEngine("maintenance-plan-enrollment")).toBe("ghl-native");
      expect(getRecipeEngine("customer-reactivation")).toBe("ghl-native");
      expect(getRecipeEngine("unsold-estimate-reactivation")).toBe("ghl-native");
      expect(getRecipeEngine("weather-event-outreach")).toBe("ghl-native");
    });

    it("defaults to 'n8n' for unknown slugs", () => {
      expect(getRecipeEngine("unknown-recipe")).toBe("n8n");
    });
  });

  describe("isGhlNative", () => {
    it("returns true for GHL-native recipes", () => {
      expect(isGhlNative("new-lead-instant-response")).toBe(true);
      expect(isGhlNative("tech-on-the-way")).toBe(true);
    });

    it("returns false for n8n recipes", () => {
      expect(isGhlNative("ai-phone-answering")).toBe(false);
      expect(isGhlNative("lead-qualification")).toBe(false);
    });

    it("returns false for unknown slugs", () => {
      expect(isGhlNative("nonexistent")).toBe(false);
    });
  });

  describe("slug lists", () => {
    it("has 9 GHL-native slugs", () => {
      expect(GHL_NATIVE_SLUGS).toHaveLength(9);
    });

    it("has 6 n8n slugs", () => {
      expect(N8N_SLUGS).toHaveLength(6);
    });

    it("has no overlap between n8n and ghl-native slugs", () => {
      const overlap = GHL_NATIVE_SLUGS.filter((s) => N8N_SLUGS.includes(s));
      expect(overlap).toHaveLength(0);
    });
  });
});
