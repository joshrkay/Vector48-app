import { type NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { createServerClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { status: "active" | "paused" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.status !== "active" && body.status !== "paused") {
    return NextResponse.json({ error: "status must be 'active' or 'paused'" }, { status: 400 });
  }

  const { error } = await supabase
    .from("recipe_activations")
    .update({ status: body.status })
    .eq("id", id)
    .eq("account_id", session.accountId);

  if (error) {
    console.error("[recipe-activation-update]", error);
    return NextResponse.json({ error: "Failed to update activation" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
