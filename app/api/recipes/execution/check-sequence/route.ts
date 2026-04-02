import { type NextRequest, NextResponse } from "next/server";
import { validateExecutionAuth } from "@/lib/recipes/executionAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
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

    const query = admin
      .from("recipe_activations")
      .select("status, config")
      .eq("account_id", accountId);

    if (recipeSlug) {
      query.eq("recipe_slug", recipeSlug);
    }

    const { data, error } = await query.limit(1).maybeSingle();

    if (error) {
      console.error("[execution/check-sequence]", error.message);
      return NextResponse.json({ error: "Failed to check sequence" }, { status: 502 });
    }

    if (!data) {
      // No activation found — not in sequence
      return NextResponse.json({ inSequence: false, paused: false });
    }

    const isActive = data.status === "active";
    const cfg = (data.config ?? {}) as Record<string, unknown>;
    const pausedIds = Array.isArray(cfg.paused_contact_ids) ? cfg.paused_contact_ids : [];
    const isPaused = pausedIds.includes(contactId);

    return NextResponse.json({
      inSequence: isActive && !isPaused,
      paused: isPaused,
    });
  } catch (err) {
    console.error("[execution/check-sequence]", err);
    return NextResponse.json({ error: "Failed to check sequence" }, { status: 502 });
  }
}
