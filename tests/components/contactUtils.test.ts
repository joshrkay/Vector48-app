import { describe, expect, it } from "vitest";
import { activationConfigPhoneMatchesContact } from "@/components/crm/contacts/contactUtils";

describe("activationConfigPhoneMatchesContact", () => {
  it("matches contact and config when both normalize to the same 10-digit US number", () => {
    expect(
      activationConfigPhoneMatchesContact("+1 (555) 123-4567", {
        phone: "5551234567",
      }),
    ).toBe(true);
  });

  it("returns false when contact phone cannot normalize", () => {
    expect(
      activationConfigPhoneMatchesContact("123", { phone: "5551234567" }),
    ).toBe(false);
  });

  it("returns false when config phone cannot normalize", () => {
    expect(
      activationConfigPhoneMatchesContact("5551234567", { phone: "12" }),
    ).toBe(false);
  });
});
