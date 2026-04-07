import { type NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { withAuthRetry } from "@/lib/ghl";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startDate = request.nextUrl.searchParams.get("startDate") ?? undefined;
  const endDate = request.nextUrl.searchParams.get("endDate") ?? undefined;
  const calendarId = request.nextUrl.searchParams.get("calendarId") ?? undefined;

  try {
    const result = await withAuthRetry(session.accountId, async (client) => {
      return client.appointments.list({ startDate, endDate, calendarId });
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[ghl-appointments-list]", error);
    return NextResponse.json({ error: "Failed to fetch appointments" }, { status: 502 });
  }
}

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
    const result = await withAuthRetry(session.accountId, async (client) => {
      return client.appointments.create({
        calendarId: body.calendarId,
        contactId: body.contactId,
        title: body.title,
        startTime: body.startTime,
        endTime: body.endTime,
      });
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[ghl-appointment-create]", error);
    return NextResponse.json({ error: "Failed to create appointment" }, { status: 502 });
  }
}
