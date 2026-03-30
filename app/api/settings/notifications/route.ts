import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { notificationsPatchSchema } from "@/lib/validations/settings";

export async function PATCH(req: Request) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = notificationsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: true });
  }

  const { notification_alert_prefs: prefsPatch, ...rest } = patch;

  const updatePayload: Record<string, unknown> = { ...rest };

  if (prefsPatch !== undefined) {
    const { data: existing } = await supabase
      .from("accounts")
      .select("notification_alert_prefs")
      .eq("id", session.accountId)
      .single();

    const prev =
      existing?.notification_alert_prefs &&
      typeof existing.notification_alert_prefs === "object"
        ? (existing.notification_alert_prefs as Record<string, boolean>)
        : {};
    updatePayload.notification_alert_prefs = { ...prev, ...prefsPatch };
  }

  const { error } = await supabase
    .from("accounts")
    .update(updatePayload)
    .eq("id", session.accountId);

  if (error) {
    console.error("[settings/notifications]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
