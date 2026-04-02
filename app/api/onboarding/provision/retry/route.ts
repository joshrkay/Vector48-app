import { NextResponse } from "next/server";

import { provisionGHL } from "@/lib/jobs/provisionGHL";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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

  const { data: membership } = await supabase
    .from("account_users")
    .select("account_id")
    .eq("account_id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: account, error: fetchError } = await admin
    .from("accounts")
    .select("ghl_provisioning_status")
    .eq("id", accountId)
    .maybeSingle();

  if (fetchError || !account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  if (account.ghl_provisioning_status === "in_progress") {
    return NextResponse.json(
      { jobId: accountId, status: "in_progress" },
      { status: 409 },
    );
  }

  if (account.ghl_provisioning_status === "complete") {
    return NextResponse.json(
      { jobId: accountId, status: "complete" },
      { status: 409 },
    );
  }

  if (account.ghl_provisioning_status !== "failed") {
    return NextResponse.json(
      { error: "Provisioning is not in a retryable state" },
      { status: 409 },
    );
  }

  const { error: updateError } = await admin
    .from("accounts")
    .update({
      ghl_provisioning_status: "in_progress",
      ghl_provisioning_error: null,
      provisioning_status: "in_progress",
      provisioning_error: null,
    })
    .eq("id", accountId);

  if (updateError) {
    return NextResponse.json({ error: "Failed to retry provisioning" }, { status: 500 });
  }

  queueMicrotask(() => {
    void provisionGHL(accountId).catch((error) => {
      console.error("[api/onboarding/provision/retry] unhandled error", error);
    });
  });

  return NextResponse.json({ jobId: accountId });
}
