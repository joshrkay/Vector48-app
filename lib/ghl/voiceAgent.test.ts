import { describe, expect, it } from "vitest";
import { buildVoiceAgentPayload } from "./voiceAgent";

describe("buildVoiceAgentPayload", () => {
  const BASE_OPTIONS = {
    locationId: "loc-123",
    businessName: "Acme HVAC",
  };

  it("builds a payload with required fields", () => {
    const payload = buildVoiceAgentPayload(BASE_OPTIONS);

    expect(payload.locationId).toBe("loc-123");
    expect(payload.name).toBe("Acme HVAC AI Assistant");
    expect(payload.businessName).toBe("Acme HVAC");
    expect(payload.language).toBe("en-US");
    expect(payload.gender).toBe("female"); // default
    expect(payload.goals).toHaveLength(3);
    expect(payload.greeting).toContain("Acme HVAC");
    expect(payload.prompt).toContain("Acme HVAC");
  });

  it("includes vertical in greeting and prompt when provided", () => {
    const payload = buildVoiceAgentPayload({
      ...BASE_OPTIONS,
      vertical: "plumbing",
    });

    expect(payload.greeting).toContain("plumbing");
    expect(payload.prompt).toContain("plumbing");
  });

  it("uses custom greeting when provided", () => {
    const payload = buildVoiceAgentPayload({
      ...BASE_OPTIONS,
      greeting: "Hello from Acme!",
    });

    expect(payload.greeting).toBe("Hello from Acme!");
  });

  it("includes forwarding number when provided", () => {
    const payload = buildVoiceAgentPayload({
      ...BASE_OPTIONS,
      forwardingNumber: "+15551234567",
    });

    expect(payload.forwardingNumber).toBe("+15551234567");
  });

  it("omits forwarding number when not provided", () => {
    const payload = buildVoiceAgentPayload(BASE_OPTIONS);

    expect(payload).not.toHaveProperty("forwardingNumber");
  });

  it("includes timezone when provided", () => {
    const payload = buildVoiceAgentPayload({
      ...BASE_OPTIONS,
      timezone: "America/Phoenix",
    });

    expect(payload.timezone).toBe("America/Phoenix");
  });

  it("respects voice gender preference", () => {
    const payload = buildVoiceAgentPayload({
      ...BASE_OPTIONS,
      voiceGender: "male",
    });

    expect(payload.gender).toBe("male");
  });

  it("has required goals for caller info collection", () => {
    const payload = buildVoiceAgentPayload(BASE_OPTIONS);

    const fields = payload.goals!.map((g) => g.field);
    expect(fields).toContain("caller_name");
    expect(fields).toContain("phone_number");
    expect(fields).toContain("reason");
    expect(payload.goals!.every((g) => g.required)).toBe(true);
  });
});
