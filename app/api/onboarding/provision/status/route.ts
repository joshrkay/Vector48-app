import { NextResponse } from "next/server";

import { failedStepFromError } from "@/lib/jobs/provisionGHL";
import { SupabaseConfigError } from "@/lib/supabase/env";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isSupabaseConfigError(error: unknown): error is SupabaseConfigError {
  if (error instanceof SupabaseConfigError) {
    return true;
  }

  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code = "code" in error ? error.code : undefined;
  const name = "name" in error ? error.name : undefined;

  return code === "CONFIG_ERROR" || name === "SupabaseConfigError";
}

export async function GET(req: Request) {
  try {
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
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      return NextResponse.json(
        {
          status: "degraded",
          degraded: true,
          error: {
            code: error.code,
            message:
              "Provisioning status is temporarily unavailable due to server configuration.",
          },
        },
        { status: 503 },
      );
    }

    console.error("[onboarding/provision/status] operational failure", error);
    return NextResponse.json(
      {
        error: {
          code: "OPERATIONAL_ERROR",
          message: "Unexpected error while fetching provisioning status.",
        },
      },
      { status: 500 },
    );
  }
}
