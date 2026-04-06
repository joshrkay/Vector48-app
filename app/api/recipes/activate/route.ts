import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAccountForUser } from "@/lib/auth/account";
import { enqueueRecipeProvisioning } from "@/lib/n8n/recipeProvisioning";
import {
  getRecipeDefinitionOrThrow,
  validateActivationRequest,
} from "@/lib/recipes/activationValidator";
import { createServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  recipeSlug: z.string().min(1),
  config: z.record(z.unknown()).optional().default({}),
});

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase, { request });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const recipe = getRecipeDefinitionOrThrow(parsed.data.recipeSlug);
  if (!recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  const validation = await validateActivationRequest(
    supabase,
    session.accountId,
    recipe,
    parsed.data.config,
  );

  if (!validation.ok) {
    if (validation.code === "PLAN_LIMIT") {
      return NextResponse.json(validation, { status: 403 });
    }

    return NextResponse.json(
      {
        error: validation.error,
        code: validation.code,
        missingIntegrations: validation.missingIntegrations,
      },
      { status: validation.status },
    );
  }

  if (validation.idempotent) {
    return NextResponse.json({
      success: true,
      idempotent: true,
      activationId: validation.existingActivationId,
    });
  }

  const nowIso = new Date().toISOString();
  const { data: inserted, error: insertError } = await supabase
    .from("recipe_activations")
    .insert({
      account_id: session.accountId,
      recipe_slug: recipe.slug,
      status: "active",
      config: validation.config,
      activated_at: nowIso,
      deactivated_at: null,
      error_message: null,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: insertError?.message ?? "Could not activate recipe" },
      { status: 400 },
    );
  }

  enqueueRecipeProvisioning({
    activationId: inserted.id,
    accountId: session.accountId,
    recipeSlug: recipe.slug,
    config: validation.config,
  });

  return NextResponse.json({ success: true, activationId: inserted.id });
}
