// ---------------------------------------------------------------------------
// Recipe Runner Webhook (Phase 2)
//
// POST /api/recipes/webhook/[slug]/[accountId]
//
// Single entry point for GHL-originated recipe triggers that route through
// the Anthropic Agent SDK runner (replacing the equivalent n8n webhook).
// The route:
//
//   1. Validates the incoming body is signed by GHL, using the existing
//      authenticateGhlWebhook helper. In dev, GHL_WEBHOOK_ALLOW_UNSIGNED=true
//      + x-ghl-test-secret lets the smoke script POST a synthetic payload.
//   2. Pins accountId from the URL (not from the body) so a forged body
//      cannot cross-tenant a legitimate-looking account.
//   3. Calls runRecipe with a trigger object shaped for the recipe.
//   4. Writes an automation_events row summarising the result so the
//      dashboard/feed shows what happened.
//
// Only ai-phone-answering is wired in Phase 2 — other slugs return 404
// until their handlers are ported.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";

import { authenticateGhlWebhook } from "@/app/api/webhooks/ghl/signatureVerification";
import type { GHLWebhookCallCompleted } from "@/lib/ghl/webhookTypes";
import {
  RecipeAgentNotFoundError,
  RecipeHandlerNotRegisteredError,
  runRecipe,
} from "@/lib/recipes/runner";
import type { PhoneAnsweringTrigger } from "@/lib/recipes/runner/recipes/aiPhoneAnswering";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const SUPPORTED_SLUGS = new Set<string>(["ai-phone-answering"]);

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; accountId: string }> },
) {
  const { slug, accountId } = await context.params;

  if (!SUPPORTED_SLUGS.has(slug)) {
    return NextResponse.json(
      { error: `Recipe ${slug} is not yet routed through the Agent SDK runner` },
      { status: 404 },
    );
  }

  const rawBody = await request.text();
  const auth = authenticateGhlWebhook(rawBody, request.headers);
  if (!auth.ok) {
    return NextResponse.json(
      { error: "webhook_unauthorized", reason: auth.reason },
      { status: 401 },
    );
  }

  let body: GHLWebhookCallCompleted;
  try {
    body = JSON.parse(rawBody) as GHLWebhookCallCompleted;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const trigger: PhoneAnsweringTrigger = { call: body };

  try {
    const result = await runRecipe({
      accountId,
      recipeSlug: slug,
      trigger,
    });

    // Best-effort automation_events write so the dashboard feed reflects
    // the run. Failure to log does not fail the request — the tracked
    // client already wrote an llm_usage_events row for any LLM call.
    try {
      const supabase = getSupabaseAdmin();
      await supabase.from("automation_events").insert({
        account_id: accountId,
        recipe_slug: slug,
        event_type: "recipe_run",
        status: "success",
        metadata: {
          outcome: (result as { outcome?: string } | undefined)?.outcome ?? null,
          sms_message_id:
            (result as { smsMessageId?: string | null } | undefined)
              ?.smsMessageId ?? null,
        },
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error(
        `[recipes/webhook] automation_events log failed for ${accountId}/${slug}:`,
        logErr,
      );
    }

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    if (err instanceof RecipeAgentNotFoundError) {
      return NextResponse.json(
        { error: "agent_not_configured", message: err.message },
        { status: 404 },
      );
    }
    if (err instanceof RecipeHandlerNotRegisteredError) {
      return NextResponse.json(
        { error: "handler_not_registered", message: err.message },
        { status: 501 },
      );
    }
    // eslint-disable-next-line no-console
    console.error(
      `[recipes/webhook] runRecipe failed for ${accountId}/${slug}:`,
      err,
    );
    return NextResponse.json(
      {
        error: "internal_error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
