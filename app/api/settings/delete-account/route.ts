import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { deleteAccountSchema } from "@/lib/validations/settings";

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = deleteAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { error: actErr } = await admin
    .from("recipe_activations")
    .update({
      status: "deactivated",
      deactivated_at: now,
    })
    .eq("account_id", session.accountId)
    .in("status", ["active", "paused", "error"]);

  if (actErr) {
    console.error("[delete-account] activations", actErr.message);
    return NextResponse.json({ error: "Could not deactivate recipes" }, { status: 500 });
  }

  const { error: intErr } = await admin
    .from("integrations")
    .update({
      status: "disconnected",
      credentials_encrypted: null,
    })
    .eq("account_id", session.accountId);

  if (intErr) {
    console.error("[delete-account] integrations", intErr.message);
  }

  const { error: accErr } = await admin
    .from("accounts")
    .delete()
    .eq("id", session.accountId);

  if (accErr) {
    console.error("[delete-account] account", accErr.message);
    return NextResponse.json({ error: "Could not delete account" }, { status: 500 });
  }

  const { error: delAuthErr } = await admin.auth.admin.deleteUser(session.userId);
  if (delAuthErr) {
    console.error("[delete-account] auth delete", delAuthErr.message);
    return NextResponse.json(
      { error: "Account deleted; auth cleanup failed — contact support" },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true });
}
