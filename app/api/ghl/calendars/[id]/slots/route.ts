import { type NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { withAuthRetry } from "@/lib/ghl";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: calendarId } = await params;
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const timezone = searchParams.get("timezone") ?? undefined;

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "startDate and endDate are required" },
      { status: 400 },
    );
  }

  try {
    const result = await withAuthRetry(session.accountId, async (client) => {
      return client.calendars.getSlots({ calendarId, startDate, endDate, timezone });
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[ghl-calendar-slots]", error);
    return NextResponse.json({ error: "Failed to fetch available slots" }, { status: 502 });
  }
}
