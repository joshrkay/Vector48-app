import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  // RLS ensures user can only see their own accounts
  const { data: account, error } = await supabase
    .from("accounts")
    .select("provisioning_status, provisioning_error, provisioning_step")
    .eq("id", jobId)
    .single();

  if (error || !account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Map DB enum 'error' → API response 'failed'
  const statusMap: Record<string, string> = {
    pending: "pending",
    complete: "complete",
    error: "failed",
  };

  return NextResponse.json({
    status: statusMap[account.provisioning_status] ?? "pending",
    ...(account.provisioning_error && { error: account.provisioning_error }),
    ...(account.provisioning_step != null && { step: account.provisioning_step }),
  });
}
