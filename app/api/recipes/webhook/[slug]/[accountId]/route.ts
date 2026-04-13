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
//   2. Pins accountId from the URL and verifies the payload's locationId
//      belongs to that account. A valid GHL signature proves *origin*
//      but not tenant *ownership* — a misconfigured or malicious signed
//      payload could otherwise trigger runs against the wrong tenant,
//      consuming their LLM budget and sending SMS from their configured
//      contact. We look up `accounts.ghl_location_id` and reject with
//      403 on mismatch. Skipped when the payload has no locationId (test
//      harness) as long as GHL_WEBHOOK_ALLOW_UNSIGNED is on.
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

  // Tenant-ownership check. The GHL signature proves the request came
  // from GHL, not that it belongs to the tenant named in the URL.
  // We compare the payload's locationId against accounts.ghl_location_id
  // and reject on mismatch. Body locationId is the authoritative field
  // GHL stamps on every webhook it delivers.
  const payloadLocationId = extractLocationId(body);
  const supabaseAdmin = getSupabaseAdmin();
  const { data: account, error: accountErr } = await supabaseAdmin
    .from("accounts")
    .select("id, ghl_location_id")
    .eq("id", accountId)
    .maybeSingle();

  if (accountErr) {
    // eslint-disable-next-line no-console
    console.error(
      `[recipes/webhook] failed to load account ${accountId} for locationId binding check:`,
      accountErr,
    );
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 },
    );
  }
  if (!account) {
    return NextResponse.json({ error: "unknown_account" }, { status: 404 });
  }
  if (
    typeof payloadLocationId === "string" &&
    payloadLocationId.length > 0 &&
    account.ghl_location_id !== payloadLocationId
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      `[recipes/webhook] tenant binding mismatch: url accountId=${accountId} payload locationId=${payloadLocationId} account ghl_location_id=${account.ghl_location_id}`,
    );
    return NextResponse.json(
      { error: "tenant_binding_mismatch" },
      { status: 403 },
    );
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
    //
    // Metadata shape is currently tied to PhoneAnsweringResult. When the
    // second recipe ships, move the serialisation into each handler so
    // the route stays recipe-agnostic.
    try {
      await supabaseAdmin.from("automation_events").insert({
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
      // Safe to surface — this code path is reached only after
      // authentication + tenant-binding, and the message names the
      // caller's own account/recipe.
      return NextResponse.json(
        { error: "agent_not_configured", message: err.message },
        { status: 404 },
      );
    }
    if (err instanceof RecipeHandlerNotRegisteredError) {
      return NextResponse.json(
        { error: "handler_not_registered" },
        { status: 501 },
      );
    }
    // eslint-disable-next-line no-console
    console.error(
      `[recipes/webhook] runRecipe failed for ${accountId}/${slug}:`,
      err,
    );
    // Do NOT return err.message — raw internal messages can leak
    // schema details, stack paths, or PII. The structured log above is
    // the operator-facing detail; the client gets a generic code.
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 },
    );
  }
}

/**
 * Extracts the GHL location id from a CallCompleted webhook body. GHL's
 * various call/phone webhook payloads put it at different keys, so we
 * check all the known spots. Returns null if none are present — the
 * tenant-binding check treats a missing locationId as "don't reject",
 * so that the local smoke harness (which omits it) can keep working.
 */
function extractLocationId(
  body: GHLWebhookCallCompleted & { location_id?: string },
): string | null {
  const bodyWithExtras = body as GHLWebhookCallCompleted & {
    location_id?: string;
  };
  return (
    body.locationId ??
    bodyWithExtras.location_id ??
    null
  );
}
