import { type NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { getAppointment, updateAppointment } from "@/lib/ghl/calendars";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { createServerClient } from "@/lib/supabase/server";
import type { GHLUpdateAppointmentPayload } from "@/lib/ghl/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(session.accountId);
    const result = await getAppointment(id, { locationId, apiKey: accessToken });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[ghl-appointment-get]", error);
    return NextResponse.json({ error: "Failed to fetch appointment" }, { status: 502 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: GHLUpdateAppointmentPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(session.accountId);
    const result = await updateAppointment(id, body, { locationId, apiKey: accessToken });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[ghl-appointment-update]", error);
    return NextResponse.json({ error: "Failed to update appointment" }, { status: 502 });
  }
}
