import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAccountForUser } from "@/lib/auth/account";
import { enqueueRecipeProvisioning } from "@/lib/n8n/recipeProvisioning";
import {
  getRecipeDefinitionOrThrow,
  validateActivationRequest,
} from "@/lib/recipes/activationValidator";
import { AGENT_SDK_RECIPE_SLUGS } from "@/lib/recipes/runner/archetypes";
import { seedAgentFromArchetype } from "@/lib/recipes/runner/seedAgent";
import { createServerClient } from "@/lib/supabase/server";
import { track } from "@/lib/analytics/posthog";

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

  // Agent SDK runner seeding (Phase 2): when the slug has a registered
  // archetype, copy its defaults into a tenant_agents row so the new
  // runner has something to load. This is a best-effort side effect —
  // the n8n provisioning path above is still the authoritative flow
  // until the Phase 5 cutover. Seeding failures must not 500 the
  // activate call, so we log and continue.
  //
  // Idempotent: the helper upserts on (account_id, recipe_slug), so
  // re-activating a previously-activated recipe returns the existing
  // row rather than conflicting.
  //
  // NOTE: per-activation `tool_config` overrides (e.g. a notification
  // contact id for ai-phone-answering) are not wired here. An earlier
  // draft read `validation.config.notification_contact_id`, but the
  // activation validator runs a strict `z.object` whose shape is
  // derived from `recipe.configFields` — any key not declared there is
  // silently stripped. Until either (a) `notification_contact_id` is
  // added to the catalog's `configFields`, or (b) the account-level
  // `notification_contact_phone` is resolved to a GHL contact id at
  // runtime, ai-phone-answering will seed with an empty
  // `tool_config.notification_contact_id` and the handler will return
  // `skipped_no_notification_contact` for every run. This is fine for
  // the Phase 2 walking skeleton (the smoke script bypasses this by
  // passing an explicit override through the helper) and is tracked
  // as a Phase 4 dashboard task.
  if (AGENT_SDK_RECIPE_SLUGS.includes(recipe.slug)) {
    try {
      await seedAgentFromArchetype({
        accountId: session.accountId,
        recipeSlug: recipe.slug,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[recipes/activate] failed to seed tenant_agents for ${session.accountId}/${recipe.slug}:`,
        err,
      );
      // Swallow — the activation itself succeeded and the n8n engine
      // still runs. Phase 5 cutover is gated on backfill + shadow mode,
      // not on this path being infallible.
    }
  }

  track(session.accountId, "recipe_activated", {
    slug: recipe.slug,
  });

  return NextResponse.json({ success: true, activationId: inserted.id });
}
