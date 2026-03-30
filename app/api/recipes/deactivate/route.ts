import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { deprovisionRecipe } from "@/lib/n8n/provision";

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("owner_user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const recipeSlug = body?.recipeSlug as string | undefined;

  if (!recipeSlug || typeof recipeSlug !== "string") {
    return NextResponse.json({ error: "recipeSlug is required" }, { status: 400 });
  }

  const { data: row } = await supabase
    .from("recipe_activations")
    .select("id, status, n8n_workflow_id")
    .eq("account_id", account.id)
    .eq("recipe_slug", recipeSlug)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ success: true, idempotent: true });
  }

  if (row.status === "deactivated") {
    return NextResponse.json({ success: true, idempotent: true });
  }

  try {
    await deprovisionRecipe(account.id, recipeSlug);
  } catch (e) {
    console.error(
      "[deactivate] deprovision failed",
      e instanceof Error ? e.message : String(e),
    );
    return NextResponse.json(
      { error: "Could not deactivate recipe automation" },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true });
}
