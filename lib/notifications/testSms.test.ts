import { describe, expect, it } from "vitest";

import { normalizePhone, validateTestSmsRequest } from "./testSms";

describe("normalizePhone", () => {
  it("strips non-digits and keeps 10-digit US numbers", () => {
    expect(normalizePhone("(602) 555-1234")).toBe("6025551234");
  });

  it("preserves the country code when the caller includes one", () => {
    expect(normalizePhone("+1 602 555 1234")).toBe("16025551234");
  });

  it("returns null when there are fewer than 10 digits", () => {
    expect(normalizePhone("555-1234")).toBeNull();
  });

  it("returns null for null / empty input so the caller can 400 cleanly", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});

describe("validateTestSmsRequest", () => {
  const ghlOk = { ghlLocationId: "loc_abc" };

  it("prefers the phone from the request body over the stored number", () => {
    const result = validateTestSmsRequest({
      requestedPhone: "(555) 123-4567",
      storedPhone: "+1 800 000 0000",
      ...ghlOk,
    });
    expect(result).toEqual({ ok: true, phone: "5551234567" });
  });

  it("falls back to the stored notification_contact_phone when the body is empty", () => {
    const result = validateTestSmsRequest({
      requestedPhone: "",
      storedPhone: "+1 800 555 9999",
      ...ghlOk,
    });
    expect(result).toEqual({ ok: true, phone: "18005559999" });
  });

  it("rejects with code=no_phone when neither body nor account has a number", () => {
    const result = validateTestSmsRequest({
      requestedPhone: null,
      storedPhone: null,
      ...ghlOk,
    });
    expect(result).toMatchObject({ ok: false, status: 400, code: "no_phone" });
  });

  it("rejects with code=invalid_phone when the supplied number is too short", () => {
    const result = validateTestSmsRequest({
      requestedPhone: "123",
      storedPhone: null,
      ...ghlOk,
    });
    expect(result).toMatchObject({ ok: false, status: 400, code: "invalid_phone" });
  });

  it("rejects with code=ghl_not_connected when the account lacks a GHL location", () => {
    const result = validateTestSmsRequest({
      requestedPhone: "(555) 111-2222",
      storedPhone: null,
      ghlLocationId: null,
    });
    expect(result).toMatchObject({
      ok: false,
      status: 503,
      code: "ghl_not_connected",
    });
  });

  it("treats an empty-string ghlLocationId the same as null (safety net on falsy values)", () => {
    const result = validateTestSmsRequest({
      requestedPhone: "(555) 111-2222",
      storedPhone: null,
      ghlLocationId: "",
    });
    expect(result).toMatchObject({
      ok: false,
      code: "ghl_not_connected",
    });
  });
});
