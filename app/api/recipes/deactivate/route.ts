import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { enqueueRecipeDeprovisioning } from "@/lib/n8n/recipeProvisioning";

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

  enqueueRecipeDeprovisioning({
    activationId: row.id,
    accountId: account.id,
    n8nWorkflowId: row.n8n_workflow_id,
  });

  const deactivatedAt = new Date().toISOString();
  const { error } = await supabase
    .from("recipe_activations")
    .update({
      status: "deactivated",
      deactivated_at: deactivatedAt,
    })
    .eq("id", row.id)
    .eq("account_id", account.id);

  if (error) {
    console.error("[deactivate] update failed", error.message);
    return NextResponse.json(
      { error: "Could not deactivate recipe" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
