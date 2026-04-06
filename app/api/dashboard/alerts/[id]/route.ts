import { NextResponse } from "next/server";

import { requireAccountForUser } from "@/lib/auth/account";
import { createServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: alertEvent, error: fetchError } = await admin
    .from("automation_events")
    .select("id, account_id, detail")
    .eq("id", id)
    .eq("account_id", session.accountId)
    .eq("event_type", "alert")
    .maybeSingle();

  if (fetchError) {
    console.error("[api/dashboard/alerts] fetch failed", fetchError.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  if (!alertEvent) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  const currentDetail =
    alertEvent.detail && typeof alertEvent.detail === "object"
      ? alertEvent.detail
      : {};

  const nextDetail = {
    ...currentDetail,
    resolved: true,
    resolved_at: new Date().toISOString(),
    resolved_by: session.userId,
  };

  const { error: updateError } = await admin
    .from("automation_events")
    .update({ detail: nextDetail })
    .eq("id", alertEvent.id)
    .eq("account_id", session.accountId);

  if (updateError) {
    console.error("[api/dashboard/alerts] update failed", updateError.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
