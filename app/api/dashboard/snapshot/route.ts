import { NextResponse } from "next/server";
import { getContacts } from "@/lib/ghl/contacts";

/**
 * Lightweight dashboard snapshot endpoint.
 * Returns new contacts from the last 7 days using server-side GHL filtering.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId");

  if (!locationId) {
    return NextResponse.json(
      { error: "locationId is required" },
      { status: 400 },
    );
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  const contactsResp = await getContacts(
    {
      locationId,
      "dateAdded[gte]": sevenDaysAgo.toISOString(),
      "dateAdded[lte]": now.toISOString(),
      limit: 100,
      sortBy: "dateAdded",
      sortOrder: "desc",
    },
  );

  return NextResponse.json({
    newContactsLast7Days: contactsResp.contacts.length,
    contacts: contactsResp.contacts,
  });
}
