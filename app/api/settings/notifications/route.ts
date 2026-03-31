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

  const { notification_preferences: prefsPatch, ...rest } = patch;

  const updatePayload: Record<string, unknown> = { ...rest };

  if (prefsPatch !== undefined) {
    const { data: existing } = await supabase
      .from("accounts")
      .select("notification_preferences")
      .eq("id", session.accountId)
      .single();

    const prev =
      existing?.notification_preferences &&
      typeof existing.notification_preferences === "object"
        ? (existing.notification_preferences as Record<string, unknown>)
        : {};
    updatePayload.notification_preferences = { ...prev, ...prefsPatch };
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
