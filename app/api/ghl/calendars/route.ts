import { NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { withAuthRetry } from "@/lib/ghl";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withAuthRetry(session.accountId, async (client) => {
      return client.calendars.list();
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[ghl-calendars-list]", error);
    return NextResponse.json({ error: "Failed to fetch calendars" }, { status: 502 });
  }
}
