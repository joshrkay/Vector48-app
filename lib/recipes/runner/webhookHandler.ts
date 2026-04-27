// ---------------------------------------------------------------------------
// Recipe Runner Webhook Handler (pure function + DI)
//
// The actual HTTP route at `app/api/recipes/webhook/[slug]/[accountId]`
// is a thin wrapper around this function. Extracting the logic here
// gives us:
//
//   1. Unit testability — the handler takes a Request + explicit deps
//      and returns a Response, no module-level Supabase/Anthropic state.
//   2. Integration testability — a smoke script can build a synthetic
//      Request and shim deps to drive the full pipeline against local
//      Postgres without booting `next dev`.
//   3. No eager `@supabase/supabase-js` import — production callers
//      pass in the admin client, tests pass in a pg-backed shim.
//
// Control flow:
//
//   1. SUPPORTED_SLUGS gate → 404 on unknown slug.
//   2. authenticateGhlWebhook → 401 on failed signature + unsigned test
//      mode mismatch.
//   3. Parse body → 400 on invalid JSON.
//   4. Tenant-binding check: load the account by id, reject with 403
//      when `body.locationId` does not match `accounts.ghl_location_id`.
//      Unknown accounts → 404. (codex P1 fix.)
//   5. runRecipe → 404 on RecipeAgentNotFoundError, 501 on
//      RecipeHandlerNotRegisteredError, generic 500 otherwise.
//   6. Best-effort automation_events insert — logged server-side,
//      never failures the response.
// ---------------------------------------------------------------------------

import type {
  GHLWebhookCallCompleted,
  GHLWebhookInboundMessage,
} from "@/lib/ghl/webhookTypes";
import {
  RecipeAgentNotFoundError,
  RecipeHandlerNotRegisteredError,
  type RunRecipeOptions,
} from "./index.ts";
import type { PhoneAnsweringTrigger } from "./recipes/aiPhoneAnswering.ts";
import type { LeadQualificationTrigger } from "./recipes/leadQualification.ts";

const SUPPORTED_SLUGS = new Set<string>([
  "ai-phone-answering",
  "missed-call-text-back",
  "review-request",
  "estimate-follow-up",
  "appointment-reminder",
  "new-lead-instant-response",
  "google-review-booster",
  "tech-on-the-way",
  "post-job-upsell",
  "lead-qualification",
]);

/**
 * Slugs whose trigger is built from a GHL InboundMessage webhook body
 * rather than the default CallCompleted shape. Today only
 * lead-qualification consumes inbound SMS; if a future recipe needs the
 * same payload, add its slug here.
 */
const INBOUND_MESSAGE_SLUGS = new Set<string>(["lead-qualification"]);

/**
 * Supabase-shaped client the handler uses for tenant-binding lookup
 * and automation_events logging. Overlaps with the runner deps but
 * declared locally so this module doesn't leak imports into the route.
 */
export interface WebhookSupabaseClient {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        maybeSingle: () => Promise<{
          data: { id?: string; ghl_location_id?: string | null } | null;
          error: { message: string } | null;
        }>;
      };
    };
    insert: (row: Record<string, unknown>) => Promise<{
      error: { message: string } | null;
    }>;
  };
}

export type AuthenticateWebhookFn = (
  rawBody: string,
  headers: Headers,
) =>
  | { ok: true; mode: "signed" | "unsigned_test" }
  | {
      ok: false;
      reason:
        | "missing_signature"
        | "invalid_ed25519_signature"
        | "invalid_rsa_signature"
        | "invalid_signature"
        | "unsigned_test_not_allowed";
    };

export type RunRecipeFn = (options: RunRecipeOptions) => Promise<unknown>;

export interface WebhookHandlerDeps {
  supabase: WebhookSupabaseClient;
  authenticate: AuthenticateWebhookFn;
  runRecipe: RunRecipeFn;
}

export interface WebhookHandlerParams {
  slug: string;
  accountId: string;
}

export async function handleRecipeWebhook(
  request: Request,
  params: WebhookHandlerParams,
  deps: WebhookHandlerDeps,
): Promise<Response> {
  const { slug, accountId } = params;

  if (!SUPPORTED_SLUGS.has(slug)) {
    return json(
      {
        error: `Recipe ${slug} is not yet routed through the Agent SDK runner`,
      },
      404,
    );
  }

  const rawBody = await request.text();
  const auth = deps.authenticate(rawBody, request.headers);
  if (!auth.ok) {
    return json({ error: "webhook_unauthorized", reason: auth.reason }, 401);
  }

  let body: GHLWebhookCallCompleted | GHLWebhookInboundMessage;
  try {
    body = JSON.parse(rawBody) as
      | GHLWebhookCallCompleted
      | GHLWebhookInboundMessage;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // Tenant-binding (codex P1). A valid GHL signature proves origin,
  // not ownership — we look up the account and verify the payload's
  // locationId matches accounts.ghl_location_id. Missing locationId
  // is allowed so local smoke tests that omit it still function,
  // signature check above is the primary origin gate.
  const payloadLocationId = extractLocationId(body);
  const { data: account, error: accountErr } = await deps.supabase
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
    return json({ error: "internal_error" }, 500);
  }
  if (!account) {
    return json({ error: "unknown_account" }, 404);
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
    return json({ error: "tenant_binding_mismatch" }, 403);
  }

  // Build the trigger shape the handler expects. Different recipes
  // consume different webhook payloads; today only lead-qualification
  // takes InboundMessage, the other 9 take CallCompleted-like bodies.
  let trigger: PhoneAnsweringTrigger | LeadQualificationTrigger;
  if (INBOUND_MESSAGE_SLUGS.has(slug)) {
    const inbound = body as GHLWebhookInboundMessage;
    const contactId = inbound.contactId ?? inbound.contact_id ?? "";
    const inboundText = (inbound.body ?? inbound.message ?? "").trim();
    if (!contactId || !inboundText) {
      return json(
        { error: "invalid_inbound_message_payload" },
        400,
      );
    }
    trigger = {
      contactId,
      conversationId: inbound.conversationId ?? null,
      inboundText,
    };
  } else {
    trigger = { call: body as GHLWebhookCallCompleted };
  }

  let result: unknown;
  try {
    result = await deps.runRecipe({
      accountId,
      recipeSlug: slug,
      trigger,
    });
  } catch (err) {
    if (err instanceof RecipeAgentNotFoundError) {
      return json({ error: "agent_not_configured", message: err.message }, 404);
    }
    if (err instanceof RecipeHandlerNotRegisteredError) {
      return json({ error: "handler_not_registered" }, 501);
    }
    // eslint-disable-next-line no-console
    console.error(
      `[recipes/webhook] runRecipe failed for ${accountId}/${slug}:`,
      err,
    );
    return json({ error: "internal_error" }, 500);
  }

  // Best-effort automation_events write so the feed reflects the run.
  // Column shape from 001_initial_schema.sql:
  //   account_id, recipe_slug, event_type, summary (NOT NULL), detail JSONB
  // detail{} is union-typed across recipe results so both PhoneAnswering
  // (smsMessageId) and LeadQualification (toolCalls, finalText) round-trip
  // into the activity feed without losing information.
  try {
    const r = (result ?? {}) as {
      outcome?: string;
      smsMessageId?: string | null;
      toolCalls?: Array<{ name: string; ok: boolean }>;
      finalText?: string | null;
      iterations?: number;
    };
    const outcome = r.outcome ?? "completed";
    const detail: Record<string, unknown> = { outcome };
    if (r.smsMessageId !== undefined) detail.sms_message_id = r.smsMessageId;
    if (r.toolCalls !== undefined) detail.tool_calls = r.toolCalls;
    if (r.finalText !== undefined) detail.final_text = r.finalText;
    if (r.iterations !== undefined) detail.iterations = r.iterations;

    const { error: logErr } = await deps.supabase
      .from("automation_events")
      .insert({
        account_id: accountId,
        recipe_slug: slug,
        event_type: "recipe_run",
        summary: `${slug}: ${outcome}`,
        detail,
      });
    if (logErr) {
      // eslint-disable-next-line no-console
      console.error(
        `[recipes/webhook] automation_events log failed for ${accountId}/${slug}:`,
        logErr,
      );
    }
  } catch (logThrow) {
    // eslint-disable-next-line no-console
    console.error(
      `[recipes/webhook] automation_events log threw for ${accountId}/${slug}:`,
      logThrow,
    );
  }

  return json({ ok: true, result }, 200);
}

function extractLocationId(
  body: GHLWebhookCallCompleted | GHLWebhookInboundMessage,
): string | null {
  const bodyWithExtras = body as (
    | GHLWebhookCallCompleted
    | GHLWebhookInboundMessage
  ) & {
    location_id?: string;
  };
  return body.locationId ?? bodyWithExtras.location_id ?? null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
