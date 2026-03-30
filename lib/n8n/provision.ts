import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getDecryptedGhlCredentials } from "@/lib/ghl/token";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildElevenLabsCredentialData,
  buildGhlHttpHeaderCredentialData,
  buildTwilioCredentialData,
  n8nCredentialNameElevenlabs,
  n8nCredentialNameGhl,
  n8nCredentialNameTwilio,
} from "@/lib/n8n/credentialBuilders";
import { N8nClient, N8nClientError } from "@/lib/n8n/client";
import { injectVariables } from "@/lib/n8n/variableInjector";
import { RECIPE_TEMPLATE_FILES, loadTemplateRaw } from "@/lib/n8n/templates";

const ERROR_MESSAGE_MAX = 2000;

/** Which integration credentials each recipe may create in n8n (namespaced by account id). */
const RECIPE_CREDENTIALS: Record<
  string,
  Array<"ghl" | "elevenlabs" | "twilio">
> = {
  "ai-phone-answering": ["ghl", "elevenlabs", "twilio"],
};

function createN8nClientFromEnv(): N8nClient {
  const base = process.env.N8N_BASE_URL;
  const key = process.env.N8N_API_KEY;
  if (!base || !key) {
    throw new Error("N8N_BASE_URL and N8N_API_KEY are required");
  }
  return new N8nClient(base, key);
}

/** N8N_BASE_URL should include /api/v1 — strip it to get the public UI / webhook origin. */
export function n8nPublicOriginFromBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").replace(/\/api\/v\d+$/i, "");
}

/**
 * integrations.credentials_encrypted may be plain JSON or an encrypted blob
 * ({ v, blob }) when lib/integrations/credentialStore is used — only plain JSON
 * is supported here until a shared decrypt helper is wired.
 */
function parseIntegrationCredentials(
  raw: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw.blob === "string" && "v" in raw) {
    return null;
  }
  return raw;
}

function pickString(
  obj: Record<string, unknown> | null | undefined,
  keys: string[],
  fallback = "",
): string {
  if (!obj) return fallback;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) {
      return v;
    }
  }
  return fallback;
}

function extractWebhookUrlFromWorkflow(
  workflow: unknown,
  publicOrigin: string,
): string | null {
  const nodes = (workflow as { nodes?: unknown[] }).nodes;
  if (!Array.isArray(nodes)) return null;
  for (const node of nodes) {
    const n = node as { type?: string; parameters?: { path?: string } };
    if (typeof n.type === "string" && n.type.includes("webhook")) {
      const path = n.parameters?.path;
      if (typeof path === "string" && path.length > 0) {
        const base = publicOrigin.replace(/\/$/, "");
        return `${base}/webhook/${path}`;
      }
    }
  }
  return null;
}

function setWebhookUrlInWorkflow(workflow: unknown, url: string): void {
  const nodes = (workflow as { nodes?: unknown[] }).nodes;
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    const n = node as {
      parameters?: {
        assignments?: {
          assignments?: Array<{ name?: string; value?: unknown }>;
        };
      };
    };
    const assignments = n.parameters?.assignments?.assignments;
    if (!assignments) continue;
    for (const a of assignments) {
      if (a.name === "WEBHOOK_URL") {
        a.value = url;
      }
    }
  }
}

async function markActivationError(
  admin: SupabaseClient<Database>,
  activationId: string,
  accountId: string,
  message: string,
): Promise<void> {
  const safe = message.slice(0, ERROR_MESSAGE_MAX);
  await admin
    .from("recipe_activations")
    .update({ status: "error", error_message: safe })
    .eq("id", activationId)
    .eq("account_id", accountId);
}

function resolveElevenlabsVoiceId(config: Record<string, unknown>): string {
  const fromConfig =
    typeof config.elevenlabsVoiceId === "string"
      ? config.elevenlabsVoiceId
      : typeof config.elevenLabsVoiceId === "string"
        ? config.elevenLabsVoiceId
        : "";
  if (fromConfig.length > 0) return fromConfig;
  const envDefault = process.env.ELEVENLABS_DEFAULT_VOICE_ID;
  if (typeof envDefault === "string" && envDefault.length > 0) {
    return envDefault;
  }
  return "";
}

async function findOrCreateCredential(
  client: N8nClient,
  name: string,
  type: string,
  data: Record<string, unknown>,
): Promise<{ id: string }> {
  const list = await client.getCredentials();
  const existing = list.find((c) => c.name === name);
  if (existing) {
    return { id: existing.id };
  }
  return client.createCredential(name, type, data);
}

function recipeSlugsUsingCredential(
  kind: "ghl" | "elevenlabs" | "twilio",
): string[] {
  return Object.entries(RECIPE_CREDENTIALS)
    .filter(([, v]) => v.includes(kind))
    .map(([slug]) => slug);
}

async function stillNeedsCredential(
  admin: SupabaseClient<Database>,
  accountId: string,
  kind: "ghl" | "elevenlabs" | "twilio",
): Promise<boolean> {
  const slugs = recipeSlugsUsingCredential(kind);
  const { data: rows } = await admin
    .from("recipe_activations")
    .select("recipe_slug")
    .eq("account_id", accountId)
    .in("status", ["active", "paused"])
    .in("recipe_slug", slugs);

  return (rows?.length ?? 0) > 0;
}

async function deleteCredentialIfExists(
  client: N8nClient,
  name: string,
): Promise<void> {
  const list = await client.getCredentials();
  const found = list.find((c) => c.name === name);
  if (!found) return;
  try {
    await client.deleteCredential(found.id);
  } catch (e) {
    if (e instanceof N8nClientError && e.status === 404) return;
    console.warn(
      JSON.stringify({
        level: "warn",
        service: "n8n",
        event: "credential_delete_failed",
        name,
      }),
    );
  }
}

async function ensureRecipeCredentials(
  client: N8nClient,
  accountId: string,
  recipeSlug: string,
  ctx: {
    ghlToken: string;
    elevenlabsApiKey: string;
    twilioAccountSid: string;
    twilioAuthToken: string;
  },
): Promise<void> {
  const kinds = RECIPE_CREDENTIALS[recipeSlug];
  if (!kinds) return;

  if (kinds.includes("ghl")) {
    const { type, data } = buildGhlHttpHeaderCredentialData(ctx.ghlToken);
    await findOrCreateCredential(
      client,
      n8nCredentialNameGhl(accountId),
      type,
      data,
    );
  }
  if (kinds.includes("elevenlabs")) {
    const { type, data } = buildElevenLabsCredentialData(ctx.elevenlabsApiKey);
    await findOrCreateCredential(
      client,
      n8nCredentialNameElevenlabs(accountId),
      type,
      data,
    );
  }
  if (kinds.includes("twilio")) {
    const { type, data } = buildTwilioCredentialData(
      ctx.twilioAccountSid,
      ctx.twilioAuthToken,
    );
    await findOrCreateCredential(
      client,
      n8nCredentialNameTwilio(accountId),
      type,
      data,
    );
  }
}

/**
 * Activates remain optimistic (status active before N8N succeeds). Rows with
 * status active and null n8n_workflow_id are repaired by repairStuckN8nActivations.
 */
/**
 * Deploys a tenant workflow in n8n. The activate API writes `recipe_activations` as
 * `active` before this runs; if n8n fails, status/error_message are updated here.
 * Rows stuck `active` with null `n8n_workflow_id` are retried by repairStuckN8nActivations.
 */
export async function provisionRecipe(params: {
  activationId: string;
  accountId: string;
  recipeSlug: string;
  config: Record<string, unknown>;
}): Promise<{ workflowId: string; webhookUrl: string }> {
  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  if (!RECIPE_TEMPLATE_FILES[params.recipeSlug]) {
    const msg = `No N8N template for recipe: ${params.recipeSlug}`;
    await markActivationError(
      admin,
      params.activationId,
      params.accountId,
      msg,
    );
    throw new Error(msg);
  }

  try {
    const client = createN8nClientFromEnv();

    const { data: account, error: accErr } = await admin
      .from("accounts")
      .select("business_name, phone, vertical, notification_contact")
      .eq("id", params.accountId)
      .single();

    if (accErr || !account) {
      throw new Error(`Account not found: ${params.accountId}`);
    }

    const { data: integrationRows } = await admin
      .from("integrations")
      .select("provider, credentials_encrypted, status")
      .eq("account_id", params.accountId)
      .eq("status", "connected");

    const elevenRow = integrationRows?.find(
      (r) => r.provider === "elevenlabs",
    );
    const twilioRow = integrationRows?.find((r) => r.provider === "twilio");

    const elevenPlain = parseIntegrationCredentials(
      (elevenRow?.credentials_encrypted ?? null) as Record<
        string,
        unknown
      > | null,
    );
    const twilioPlain = parseIntegrationCredentials(
      (twilioRow?.credentials_encrypted ?? null) as Record<
        string,
        unknown
      > | null,
    );

    const elevenlabsApiKey =
      pickString(elevenPlain, ["apiKey", "api_key", "elevenlabsApiKey"]) ||
      (typeof process.env.ELEVENLABS_API_KEY === "string"
        ? process.env.ELEVENLABS_API_KEY
        : "");

    const twilioAccountSid = pickString(twilioPlain, [
      "accountSid",
      "account_sid",
    ]);
    const twilioAuthToken = pickString(twilioPlain, [
      "authToken",
      "auth_token",
    ]);

    if (!elevenlabsApiKey) {
      throw new Error("ElevenLabs API key is missing (integration or env).");
    }
    if (!twilioAccountSid || !twilioAuthToken) {
      throw new Error("Twilio credentials are missing from integration.");
    }

    const ghl = await getDecryptedGhlCredentials(params.accountId);

    await ensureRecipeCredentials(client, params.accountId, params.recipeSlug, {
      ghlToken: ghl.token,
      elevenlabsApiKey,
      twilioAccountSid,
      twilioAuthToken,
    });

    const voiceId = resolveElevenlabsVoiceId(params.config);
    if (!voiceId) {
      throw new Error(
        "ELEVENLABS_DEFAULT_VOICE_ID or config elevenlabsVoiceId is required.",
      );
    }

    const vertical = account.vertical ?? "";
    const vars: Record<string, string> = {
      TENANT_ID: params.accountId,
      GHL_TOKEN: ghl.token,
      GHL_LOCATION_ID: ghl.locationId,
      BUSINESS_PHONE: account.phone ?? "",
      BUSINESS_NAME: account.business_name,
      NOTIFICATION_PHONE: account.notification_contact ?? "",
      ELEVENLABS_VOICE_ID: voiceId,
      VERTICAL: vertical,
      WEBHOOK_URL: "",
    };

    const raw = loadTemplateRaw(params.recipeSlug);
    const workflowJson = injectVariables(raw, vars) as Record<string, unknown>;

    const prevMeta =
      typeof workflowJson.meta === "object" && workflowJson.meta !== null
        ? (workflowJson.meta as Record<string, unknown>)
        : {};
    workflowJson.meta = { ...prevMeta, tenant_id: params.accountId };

    const created = await client.createWorkflow(workflowJson);
    await client.activateWorkflow(created.id);

    const fresh = await client.getWorkflow(created.id);
    const origin = n8nPublicOriginFromBaseUrl(process.env.N8N_BASE_URL ?? "");
    const webhookUrl =
      extractWebhookUrlFromWorkflow(fresh, origin) ??
      extractWebhookUrlFromWorkflow(workflowJson, origin) ??
      "";

    if (webhookUrl.length > 0) {
      setWebhookUrlInWorkflow(fresh, webhookUrl);
      await client.updateWorkflow(created.id, fresh);
    }

    await admin
      .from("recipe_activations")
      .update({
        n8n_workflow_id: created.id,
        error_message: null,
        status: "active",
      })
      .eq("id", params.activationId)
      .eq("account_id", params.accountId);

    return { workflowId: created.id, webhookUrl };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markActivationError(
      admin,
      params.activationId,
      params.accountId,
      msg,
    );
    throw e;
  }
}

export async function deprovisionRecipe(
  accountId: string,
  recipeSlug: string,
): Promise<void> {
  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const { data: row } = await admin
    .from("recipe_activations")
    .select("id, n8n_workflow_id, status")
    .eq("account_id", accountId)
    .eq("recipe_slug", recipeSlug)
    .maybeSingle();

  if (!row) return;
  if (row.status === "deactivated") return;

  const client = createN8nClientFromEnv();

  if (row.n8n_workflow_id) {
    try {
      await client.deactivateWorkflow(row.n8n_workflow_id);
    } catch {
      console.warn(
        JSON.stringify({
          level: "warn",
          service: "n8n",
          event: "deactivate_failed",
          workflowId: row.n8n_workflow_id,
        }),
      );
    }
    try {
      await client.deleteWorkflow(row.n8n_workflow_id);
    } catch {
      console.warn(
        JSON.stringify({
          level: "warn",
          service: "n8n",
          event: "delete_failed",
          workflowId: row.n8n_workflow_id,
        }),
      );
    }
  }

  const deactivatedAt = new Date().toISOString();
  await admin
    .from("recipe_activations")
    .update({
      status: "deactivated",
      deactivated_at: deactivatedAt,
      n8n_workflow_id: null,
    })
    .eq("id", row.id)
    .eq("account_id", accountId);

  await cleanupUnusedN8nCredentials(client, accountId);
}

async function cleanupUnusedN8nCredentials(
  client: N8nClient,
  accountId: string,
): Promise<void> {
  for (const kind of ["ghl", "elevenlabs", "twilio"] as const) {
    const admin = getSupabaseAdmin() as SupabaseClient<Database>;
    const needs = await stillNeedsCredential(admin, accountId, kind);
    if (needs) continue;
    if (kind === "ghl") {
      await deleteCredentialIfExists(client, n8nCredentialNameGhl(accountId));
    } else if (kind === "elevenlabs") {
      await deleteCredentialIfExists(
        client,
        n8nCredentialNameElevenlabs(accountId),
      );
    } else {
      await deleteCredentialIfExists(
        client,
        n8nCredentialNameTwilio(accountId),
      );
    }
  }
}

export async function pauseRecipe(
  accountId: string,
  recipeSlug: string,
): Promise<void> {
  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const { data: row } = await admin
    .from("recipe_activations")
    .select("id, n8n_workflow_id")
    .eq("account_id", accountId)
    .eq("recipe_slug", recipeSlug)
    .maybeSingle();

  if (!row?.n8n_workflow_id) return;

  const client = createN8nClientFromEnv();
  await client.deactivateWorkflow(row.n8n_workflow_id);

  await admin
    .from("recipe_activations")
    .update({ status: "paused" })
    .eq("id", row.id)
    .eq("account_id", accountId);
}

export async function resumeRecipe(
  accountId: string,
  recipeSlug: string,
): Promise<void> {
  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const { data: row } = await admin
    .from("recipe_activations")
    .select("id, n8n_workflow_id")
    .eq("account_id", accountId)
    .eq("recipe_slug", recipeSlug)
    .maybeSingle();

  if (!row?.n8n_workflow_id) return;

  const client = createN8nClientFromEnv();
  await client.activateWorkflow(row.n8n_workflow_id);

  await admin
    .from("recipe_activations")
    .update({ status: "active" })
    .eq("id", row.id)
    .eq("account_id", accountId);
}

/**
 * Retries provisioning for activations that remain `active` with null `n8n_workflow_id`
 * after the initial enqueue (e.g. n8n.cloud unavailable). Uses a 2-minute cutoff to
 * avoid racing an in-flight provisionRecipe.
 */
export async function repairStuckN8nActivations(): Promise<{
  repaired: number;
  failed: number;
}> {
  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  const { data: rows } = await admin
    .from("recipe_activations")
    .select("id, account_id, recipe_slug, config")
    .eq("status", "active")
    .is("n8n_workflow_id", null)
    .lt("activated_at", cutoff);

  let repaired = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    try {
      await provisionRecipe({
        activationId: row.id,
        accountId: row.account_id,
        recipeSlug: row.recipe_slug,
        config: (row.config as Record<string, unknown>) ?? {},
      });
      repaired++;
    } catch {
      failed++;
    }
  }

  return { repaired, failed };
}
