import { afterEach, describe, expect, it, vi } from "vitest";
import { getContacts } from "./contacts.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getContacts", () => {
  it("serializes dateAdded gte/lte filters unchanged", async () => {
    process.env.GHL_AGENCY_API_KEY = "test-api-key";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ contacts: [] }), { status: 200 }),
    );

    await getContacts({
      locationId: "loc_123",
      limit: 25,
      "dateAdded[gte]": "2026-03-25T00:00:00.000Z",
      "dateAdded[lte]": "2026-04-01T23:59:59.999Z",
    });
    const requestUrl = fetchSpy.mock.calls[0]?.[0];
    const url = new URL(String(requestUrl));

    expect(url.pathname).toBe("/contacts/");
    expect(url.searchParams.get("locationId")).toBe("loc_123");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("dateAdded[gte]")).toBe("2026-03-25T00:00:00.000Z");
    expect(url.searchParams.get("dateAdded[lte]")).toBe("2026-04-01T23:59:59.999Z");
  });
});
