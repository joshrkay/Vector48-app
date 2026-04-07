import { type NextRequest, NextResponse } from "next/server";
import { getExecutionAuthConfigError, validateExecutionAuth } from "@/lib/recipes/executionAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const authConfigError = getExecutionAuthConfigError();
  if (authConfigError) {
    return NextResponse.json({ error: authConfigError }, { status: 500 });
  }

  const { searchParams } = request.nextUrl;
  const accountId = searchParams.get("accountId")?.trim() ?? "";
  const contactId = searchParams.get("contactId")?.trim() ?? "";
  const recipeSlug = searchParams.get("recipeSlug")?.trim() ?? "";

  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }
  if (!contactId) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }

  if (!validateExecutionAuth(request, accountId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = getSupabaseAdmin();

    // Build query — chain filters before awaiting
    let q = admin
      .from("recipe_activations")
      .select("status, config")
      .eq("account_id", accountId)
      .eq("status", "active");

    if (recipeSlug) {
      q = q.eq("recipe_slug", recipeSlug);
    }

    // Fetch all matching activations (no limit) so that when recipeSlug is
    // omitted the check covers every active recipe for this account, not just
    // an arbitrary one.  A contact is considered paused if ANY activation has
    // them in paused_contact_ids.
    const { data: activations, error } = await q;

    if (error) {
      console.error("[execution/check-sequence]", error.message);
      return NextResponse.json({ error: "Failed to check sequence" }, { status: 502 });
    }

    if (!activations || activations.length === 0) {
      // No active activation found — not in any sequence
      return NextResponse.json({ inSequence: false, paused: false });
    }

    const isPaused = activations.some((row) => {
      const cfg = row.config as Record<string, unknown>;
      const pausedIds = Array.isArray(cfg.paused_contact_ids) ? (cfg.paused_contact_ids as string[]) : [];
      return pausedIds.includes(contactId);
    });

    // N8N workflows should call this before each send step.
    // Note: a message already in-flight at the exact moment of pause may still
    // complete — this is an inherent timing window, not a bug.
    return NextResponse.json({
      inSequence: !isPaused,
      paused: isPaused,
    });
  } catch (err) {
    console.error("[execution/check-sequence]", err);
    return NextResponse.json({ error: "Failed to check sequence" }, { status: 502 });
  }
}
