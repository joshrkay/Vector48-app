import { type NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { withAuthRetry } from "@/lib/ghl";
import { createServerClient } from "@/lib/supabase/server";

export async function PATCH(
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
    const result = await withAuthRetry(session.accountId, async (client) => {
      return client.appointments.update(id, { status: "cancelled" });
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[ghl-appointment-cancel]", error);
    return NextResponse.json({ error: "Failed to cancel appointment" }, { status: 502 });
  }
}
