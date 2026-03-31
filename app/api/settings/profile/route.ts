import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { profilePatchSchema } from "@/lib/validations/settings";

export async function PATCH(req: Request) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = profilePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: true });
  }

  const { error } = await supabase
    .from("accounts")
    .update(patch)
    .eq("id", session.accountId);

  if (error) {
    console.error("[settings/profile]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
