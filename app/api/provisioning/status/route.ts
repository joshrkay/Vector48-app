import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("ghl_provisioning_status, ghl_provisioning_error")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const body: { status: string; error?: string } = {
    status: account.ghl_provisioning_status,
  };
  if (account.ghl_provisioning_error) {
    body.error = account.ghl_provisioning_error;
  }

  return NextResponse.json(body);
}
