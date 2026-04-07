import { describe, expect, it } from "vitest";
import { resolveMessageTemplate, interpolateMessage } from "./messageTemplate";

// Tests for the pure message template functions.
// The executeGhlNativeRecipe function (server-only) is integration-tested separately.

describe("resolveMessageTemplate", () => {
  it("returns config override message when present (responseMessage)", () => {
    const result = resolveMessageTemplate(
      "new-lead-instant-response",
      "hvac",
      { responseMessage: "Custom hello!" },
    );
    expect(result).toBe("Custom hello!");
  });

  it("returns config override for seasonalMessage key", () => {
    const result = resolveMessageTemplate(
      "seasonal-demand-outreach",
      "plumbing",
      { seasonalMessage: "Summer promo!" },
    );
    expect(result).toBe("Summer promo!");
  });

  it("returns config override for weatherMessage key", () => {
    const result = resolveMessageTemplate(
      "weather-event-outreach",
      "roofing",
      { weatherMessage: "Storm cleanup offer!" },
    );
    expect(result).toBe("Storm cleanup offer!");
  });

  it("falls back to vertical-specific template", () => {
    const result = resolveMessageTemplate(
      "new-lead-instant-response",
      "plumbing",
      {},
    );
    expect(result).toContain("plumbing");
    expect(result).toContain("{{contact_name}}");
    expect(result).toContain("{{business_name}}");
  });

  it("falls back to HVAC template for unknown vertical", () => {
    const result = resolveMessageTemplate(
      "new-lead-instant-response",
      "unknown-vertical",
      {},
    );
    expect(result).toContain("heating or cooling");
  });

  it("falls back to HVAC template when vertical is null", () => {
    const result = resolveMessageTemplate(
      "new-lead-instant-response",
      null,
      {},
    );
    expect(result).toContain("{{contact_name}}");
  });

  it("returns null for unknown recipe slug", () => {
    const result = resolveMessageTemplate("nonexistent-recipe", "hvac", {});
    expect(result).toBeNull();
  });

  it("returns first matching config key in priority order", () => {
    // upsellMessage comes before reactivationMessage in the key scan order
    const result = resolveMessageTemplate(
      "customer-reactivation",
      "hvac",
      { reactivationMessage: "Come back!", upsellMessage: "Upgrade!" },
    );
    expect(result).toBe("Upgrade!");
  });
});

describe("interpolateMessage", () => {
  it("replaces merge fields", () => {
    const result = interpolateMessage(
      "Hey {{contact_name}}, thanks for choosing {{business_name}}!",
      { contact_name: "John", business_name: "Acme HVAC" },
    );
    expect(result).toBe("Hey John, thanks for choosing Acme HVAC!");
  });

  it("replaces multiple occurrences of the same field", () => {
    const result = interpolateMessage(
      "{{business_name}} - call {{business_name}} today!",
      { business_name: "Acme" },
    );
    expect(result).toBe("Acme - call Acme today!");
  });

  it("replaces missing fields with empty string", () => {
    const result = interpolateMessage(
      "Hey {{contact_name}}, ETA {{eta}} min",
      { contact_name: "Jane" },
    );
    expect(result).toBe("Hey Jane, ETA  min");
  });

  it("handles templates with no merge fields", () => {
    const result = interpolateMessage("No fields here", { business_name: "Acme" });
    expect(result).toBe("No fields here");
  });

  it("handles all supported merge fields", () => {
    const result = interpolateMessage(
      "{{contact_name}} {{business_name}} {{appointment_time}} {{tech_name}} {{eta}} {{review_link}} {{weather_event}}",
      {
        contact_name: "A",
        business_name: "B",
        appointment_time: "C",
        tech_name: "D",
        eta: "E",
        review_link: "F",
        weather_event: "G",
      },
    );
    expect(result).toBe("A B C D E F G");
  });

  it("handles empty template", () => {
    const result = interpolateMessage("", { contact_name: "test" });
    expect(result).toBe("");
  });
});
