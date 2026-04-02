import { NextResponse } from "next/server";

import { failedStepFromError } from "@/lib/jobs/provisionGHL";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId") ?? searchParams.get("jobId");

  if (!accountId) {
    return NextResponse.json(
      { error: "accountId or jobId is required" },
      { status: 400 },
    );
  }

  const { data: account, error } = await supabase
    .from("accounts")
    .select("ghl_provisioning_status, ghl_provisioning_error")
    .eq("id", accountId)
    .maybeSingle();

  if (error || !account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: account.ghl_provisioning_status,
    ...(account.ghl_provisioning_error
      ? { error: account.ghl_provisioning_error }
      : {}),
    ...(account.ghl_provisioning_error
      ? { failedStep: failedStepFromError(account.ghl_provisioning_error) }
      : {}),
  });
}
