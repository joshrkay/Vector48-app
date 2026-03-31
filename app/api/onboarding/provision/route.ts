import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { provisionGHL } from "@/lib/jobs/provisionGHL";

export async function POST(req: Request) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const accountId = body.accountId as string | undefined;

  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }

  // Verify user owns account
  const { data: membership } = await supabase
    .from("account_users")
    .select("account_id")
    .eq("account_id", accountId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Reset provisioning state for retry support
  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("accounts")
    .update({
      provisioning_status: "pending" as const,
      provisioning_error: null,
    })
    .eq("id", accountId);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to initiate provisioning" },
      { status: 500 },
    );
  }

  // Fire-and-forget — provisioning runs in the background
  provisionGHL(accountId).catch((err) => {
    console.error("[provision/route] Unhandled provisioning error:", err);
  });

  return NextResponse.json({ jobId: accountId });
}
