import { NextResponse } from "next/server";

import { inngest } from "@/lib/inngest/client";
import {
  attachRequestIdHeader,
  getOrCreateRequestId,
} from "@/lib/observability/request-logging";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const requestId = getOrCreateRequestId(req.headers);
  const respond = (body: unknown, status = 200) =>
    attachRequestIdHeader(NextResponse.json(body, { status }), requestId);

  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return respond({ error: "Not authenticated" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const accountId = body.accountId as string | undefined;

    if (!accountId) {
      return respond({ error: "accountId is required" }, 400);
    }

    const { data: membership } = await supabase
      .from("account_users")
      .select("account_id")
      .eq("account_id", accountId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return respond({ error: "Unauthorized" }, 403);
    }

    const admin = createAdminClient();
    const { data: account, error: fetchError } = await admin
      .from("accounts")
      .select("ghl_provisioning_status")
      .eq("id", accountId)
      .maybeSingle();

    if (fetchError || !account) {
      return respond({ error: "Account not found" }, 404);
    }

    if (account.ghl_provisioning_status === "in_progress") {
      return respond({ jobId: accountId, status: "in_progress" }, 409);
    }

    if (account.ghl_provisioning_status === "complete") {
      return respond({ jobId: accountId, status: "complete" }, 409);
    }

    if (account.ghl_provisioning_status === "failed") {
      return respond({ jobId: accountId, status: "failed" }, 409);
    }

    const { error: updateError } = await admin
      .from("accounts")
      .update({
        ghl_provisioning_status: "in_progress",
        ghl_provisioning_error: null,
      })
      .eq("id", accountId);

    if (updateError) {
      console.error("[api/onboarding/provision] failed to initiate provisioning", {
        accountId,
        requestId,
        status: 500,
        error: updateError,
      });
      return respond({ error: "Failed to initiate provisioning" }, 500);
    }

    try {
      await inngest.send({
        name: "app/customer.onboarding.completed",
        data: { accountId, activateRecipe: false },
      });
    } catch (error) {
      console.error("[api/onboarding/provision] failed to enqueue provisioning job", {
        accountId,
        requestId,
        status: 500,
        error,
      });

      await admin
        .from("accounts")
        .update({
          ghl_provisioning_status: "failed",
          ghl_provisioning_error: "Failed to enqueue provisioning job",
        })
        .eq("id", accountId);

      return respond({ error: "Failed to enqueue provisioning job" }, 500);
    }

    return respond({ jobId: accountId });
  } catch (error) {
    console.error("[api/onboarding/provision] unexpected error", {
      requestId,
      status: 500,
      error,
    });
    return respond({ error: "Internal server error" }, 500);
  }
}
