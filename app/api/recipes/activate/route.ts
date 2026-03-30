import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  assertPlanAllowsMoreActivations,
  getMissingIntegrations,
  getRecipeDefinitionOrThrow,
  validateRecipeConfig,
} from "@/lib/recipes/activationValidator";
import { enqueueRecipeProvisioning } from "@/lib/n8n/recipeProvisioning";

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
  const config = body?.config;

  if (!recipeSlug || typeof recipeSlug !== "string") {
    return NextResponse.json({ error: "recipeSlug is required" }, { status: 400 });
  }

  const recipe = getRecipeDefinitionOrThrow(recipeSlug);
  if (!recipe) {
    return NextResponse.json(
      { error: "Unknown or unavailable recipe" },
      { status: 404 },
    );
  }

  const cfg = validateRecipeConfig(recipe, config);
  if (!cfg.ok) {
    return NextResponse.json({ error: cfg.message }, { status: 400 });
  }

  const missing = await getMissingIntegrations(
    supabase,
    account.id,
    recipe.requiredIntegrations,
  );
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: "Missing integrations",
        missingIntegrations: missing,
      },
      { status: 400 },
    );
  }

  const { data: existing } = await supabase
    .from("recipe_activations")
    .select("id, status")
    .eq("account_id", account.id)
    .eq("recipe_slug", recipeSlug)
    .maybeSingle();

  if (existing?.status === "active") {
    return NextResponse.json({
      success: true,
      activationId: existing.id,
      idempotent: true,
    });
  }

  const plan = await assertPlanAllowsMoreActivations(account.id, supabase);
  if (!plan.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: plan.code,
        planDisplayName: plan.planDisplayName,
        message: plan.message,
        upgradeHref: plan.upgradeHref,
      },
      { status: 200 },
    );
  }

  const activatedAt = new Date().toISOString();

  if (existing) {
    const { data: updated, error } = await supabase
      .from("recipe_activations")
      .update({
        status: "active",
        config: cfg.data,
        activated_at: activatedAt,
        deactivated_at: null,
        n8n_workflow_id: null,
      })
      .eq("id", existing.id)
      .eq("account_id", account.id)
      .select("id")
      .single();

    if (error || !updated) {
      console.error("[activate] update failed", error?.message);
      return NextResponse.json(
        { error: "Could not activate recipe" },
        { status: 500 },
      );
    }

    enqueueRecipeProvisioning({
      activationId: updated.id,
      accountId: account.id,
      recipeSlug,
      config: cfg.data,
    });

    return NextResponse.json({ success: true, activationId: updated.id });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("recipe_activations")
    .insert({
      account_id: account.id,
      recipe_slug: recipeSlug,
      status: "active",
      config: cfg.data,
      activated_at: activatedAt,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[activate] insert failed", insertError?.message);
    return NextResponse.json(
      { error: "Could not activate recipe" },
      { status: 500 },
    );
  }

  enqueueRecipeProvisioning({
    activationId: inserted.id,
    accountId: account.id,
    recipeSlug,
    config: cfg.data,
  });

  return NextResponse.json({ success: true, activationId: inserted.id });
}
