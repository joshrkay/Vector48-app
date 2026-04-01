import { type NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { createAppointment } from "@/lib/ghl/calendars";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    calendarId: string;
    contactId: string;
    title?: string;
    startTime: string;
    endTime: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.calendarId || !body.contactId || !body.startTime || !body.endTime) {
    return NextResponse.json({ error: "calendarId, contactId, startTime, endTime are required" }, { status: 400 });
  }

  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(session.accountId);
    const result = await createAppointment(
      {
        calendarId: body.calendarId,
        locationId,
        contactId: body.contactId,
        title: body.title,
        startTime: body.startTime,
        endTime: body.endTime,
      },
      { locationId, apiKey: accessToken },
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[ghl-appointment-create]", error);
    return NextResponse.json({ error: "Failed to create appointment" }, { status: 502 });
  }
}
