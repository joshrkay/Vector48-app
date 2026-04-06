import { describe, expect, it } from "vitest";
import {
  getContactFromCache,
  seedContactsInCache,
  toCachedContact,
} from "@/lib/crm/contactCache";

describe("contactCache", () => {
  it("normalizes non-search contact records into cache items", () => {
    expect(
      toCachedContact({
        id: "contact_normalized",
        firstName: "Mike",
        lastName: "Townsend",
        email: " mike@example.com ",
        phone: " 555-0100 ",
      }),
    ).toEqual({
      id: "contact_normalized",
      name: "Mike Townsend",
      email: "mike@example.com",
      phone: "555-0100",
    });
  });

  it("seeds the in-memory cache from already-fetched CRM data", () => {
    seedContactsInCache([
      {
        id: "contact_seeded",
        name: "Mike T.",
        phone: "555-0101",
      },
      {
        firstName: "No",
        lastName: "Id",
      },
    ]);

    expect(getContactFromCache("contact_seeded")).toEqual({
      id: "contact_seeded",
      name: "Mike T.",
      email: null,
      phone: "555-0101",
    });
  });
});
