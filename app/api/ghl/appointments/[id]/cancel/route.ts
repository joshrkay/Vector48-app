import { type NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { updateAppointment } from "@/lib/ghl/calendars";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { createServerClient } from "@/lib/supabase/server";

export async function PATCH(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(session.accountId);
    const result = await updateAppointment(
      params.id,
      { status: "cancelled" },
      { locationId, apiKey: accessToken },
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("[ghl-appointment-cancel]", error);
    return NextResponse.json({ error: "Failed to cancel appointment" }, { status: 502 });
  }
}
