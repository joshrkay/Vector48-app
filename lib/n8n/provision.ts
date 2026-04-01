// ---------------------------------------------------------------------------
// N8N recipe provisioning — server-only (uses service role + n8n API).
// Isolation: credentials named ghl_${accountId}, elevenlabs_${accountId}; workflows
// reference only those credential ids and meta.tenant_id = account_id.
// Recovery: rows with status active and n8n_workflow_id null are picked up by
// reconcileProvisioning (e.g. cron) after transient n8n outages.
// ---------------------------------------------------------------------------
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getAccountGhlCredentials } from "@/lib/ghl";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

import { createN8nClientFromEnv, type N8nClient } from "./client";
import { loadTemplate } from "./templates";
import { injectVariables } from "./variableInjector";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function stringFromConfig(
  config: Record<string, unknown> | null | undefined,
  key: string,
  fallback = "",
): string {
  if (!config || config[key] === undefined || config[key] === null) {
    return fallback;
  }
  return String(config[key]);
}

function sanitizeErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message.slice(0, 4000);
  }
  return "Provisioning failed";
}

async function ensureHttpHeaderCredential(
  client: N8nClient,
  name: string,
  headerName: string,
  headerValue: string,
): Promise<string> {
  const all = await client.getCredentials();
  const existing = all.find((c) => c.name === name && c.type === "httpHeaderAuth");
  if (existing?.id) {
    return existing.id;
  }
  const created = await client.createCredential(name, "httpHeaderAuth", {
    name: headerName,
    value: headerValue,
  });
  return created.id;
}

async function ensureGhlCredential(
  client: N8nClient,
  accountId: string,
  accessToken: string,
): Promise<string> {
  const name = `ghl_${accountId}`;
  return ensureHttpHeaderCredential(
    client,
    name,
    "Authorization",
    `Bearer ${accessToken}`,
  );
}

async function ensureElevenLabsCredential(
  client: N8nClient,
  accountId: string,
  apiKey: string,
): Promise<string> {
  const name = `elevenlabs_${accountId}`;
  return ensureHttpHeaderCredential(client, name, "xi-api-key", apiKey);
}

export interface ProvisionResult {
  workflowId: string;
  webhookUrl: string;
}

/**
 * Full provisioning: template load, credentials (idempotent), workflow create + activate, DB update.
 */
export async function provisionRecipe(
  accountId: string,
  recipeSlug: string,
  config: Record<string, unknown> | null,
  activationId: string,
): Promise<ProvisionResult> {
  const supabase = getSupabaseAdmin();
  const n8n = createN8nClientFromEnv();

  const { data: account, error: accErr } = await supabase
    .from("accounts")
    .select("business_name, phone, vertical, notification_contact_phone")
    .eq("id", accountId)
    .single();

  if (accErr || !account) {
    await markActivationError(supabase, activationId, "Account not found");
    throw new Error("Account not found");
  }

  try {
    const ghl = await getAccountGhlCredentials(accountId);
    const ghlCredId = await ensureGhlCredential(n8n, accountId, ghl.accessToken);

    const elevenKey = process.env.ELEVENLABS_API_KEY ?? "";
    if (elevenKey.length > 0) {
      await ensureElevenLabsCredential(n8n, accountId, elevenKey);
    }

    const baseUrl = normalizeBaseUrl(process.env.N8N_BASE_URL ?? "");
    const webhookPath = `ai-phone-${accountId}`;
    const webhookUrl = `${baseUrl}/webhook/${webhookPath}`;

    const notificationPhone =
      stringFromConfig(config, "notification_sms_number") ||
      account.notification_contact_phone ||
      account.phone ||
      "";

    const elevenVoice =
      stringFromConfig(config, "elevenlabs_voice_id") ||
      process.env.ELEVENLABS_DEFAULT_VOICE_ID ||
      "";

    const variables: Record<string, string> = {
      TENANT_ID: accountId,
      GHL_CREDENTIAL_ID: ghlCredId,
      BUSINESS_NAME: account.business_name ?? "",
      BUSINESS_PHONE: account.phone ?? "",
      NOTIFICATION_PHONE: notificationPhone,
      VERTICAL: account.vertical ?? "",
      ELEVENLABS_VOICE_ID: elevenVoice,
      WEBHOOK_URL: webhookUrl,
    };

    const templateStr = loadTemplate(recipeSlug);
    const workflowObject = injectVariables(templateStr, variables);

    const { id: workflowId } = await n8n.createWorkflow(workflowObject);
    await n8n.activateWorkflow(workflowId);

    const { error: upErr } = await supabase
      .from("recipe_activations")
      .update({
        n8n_workflow_id: workflowId,
        status: "active",
        error_message: null,
      })
      .eq("id", activationId);

    if (upErr) {
      throw new Error(upErr.message);
    }

    return { workflowId, webhookUrl };
  } catch (err) {
    const msg = sanitizeErrorMessage(err);
    await markActivationError(supabase, activationId, msg);
    throw err;
  }
}

async function markActivationError(
  supabase: SupabaseClient<Database>,
  activationId: string,
  message: string,
): Promise<void> {
  await supabase
    .from("recipe_activations")
    .update({
      status: "error",
      error_message: message,
    })
    .eq("id", activationId);
}

export async function deprovisionRecipe(
  accountId: string,
  recipeSlug: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const n8n = createN8nClientFromEnv();

  const { data: row, error } = await supabase
    .from("recipe_activations")
    .select("id, n8n_workflow_id")
    .eq("account_id", accountId)
    .eq("recipe_slug", recipeSlug)
    .order("activated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !row) {
    throw new Error("Recipe activation not found");
  }

  const workflowId = row.n8n_workflow_id;
  if (workflowId) {
    try {
      await n8n.deactivateWorkflow(workflowId);
    } catch {
      // continue with delete
    }
    try {
      await n8n.deleteWorkflow(workflowId);
    } catch {
      // still mark DB deactivated
    }
  }

  await supabase
    .from("recipe_activations")
    .update({
      status: "deactivated",
      n8n_workflow_id: null,
      error_message: null,
    })
    .eq("id", row.id);

  await maybeCleanupCredentials(n8n, supabase, accountId);
}

export async function pauseRecipe(
  accountId: string,
  recipeSlug: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const n8n = createN8nClientFromEnv();

  const { data: row, error } = await supabase
    .from("recipe_activations")
    .select("id, n8n_workflow_id")
    .eq("account_id", accountId)
    .eq("recipe_slug", recipeSlug)
    .order("activated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !row?.n8n_workflow_id) {
    throw new Error("Active workflow not found for recipe");
  }

  await n8n.deactivateWorkflow(row.n8n_workflow_id);

  await supabase
    .from("recipe_activations")
    .update({ status: "paused" })
    .eq("id", row.id);
}

export async function resumeRecipe(
  accountId: string,
  recipeSlug: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const n8n = createN8nClientFromEnv();

  const { data: row, error } = await supabase
    .from("recipe_activations")
    .select("id, n8n_workflow_id")
    .eq("account_id", accountId)
    .eq("recipe_slug", recipeSlug)
    .order("activated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !row?.n8n_workflow_id) {
    throw new Error("Paused workflow not found for recipe");
  }

  await n8n.activateWorkflow(row.n8n_workflow_id);

  await supabase
    .from("recipe_activations")
    .update({ status: "active", error_message: null })
    .eq("id", row.id);
}

async function maybeCleanupCredentials(
  client: N8nClient,
  supabase: SupabaseClient<Database>,
  accountId: string,
): Promise<void> {
  const { data: others, error } = await supabase
    .from("recipe_activations")
    .select("id")
    .eq("account_id", accountId)
    .in("status", ["active", "paused"]);

  if (error || (others && others.length > 0)) {
    return;
  }

  const creds = await client.getCredentials();
  const prefix = `ghl_${accountId}`;
  const elPrefix = `elevenlabs_${accountId}`;
  for (const c of creds) {
    if (c.name === prefix || c.name === elPrefix) {
      await client.deleteCredential(c.id);
    }
  }
}

/**
 * Retry provisioning for activations that are still active but have no n8n workflow id
 * (e.g. n8n was down during first attempt). Intended for cron / internal job.
 */
export async function reconcileProvisioning(
  supabase: SupabaseClient<Database> = getSupabaseAdmin(),
): Promise<{ retried: number; failed: number }> {
  const { data: rows, error } = await supabase
    .from("recipe_activations")
    .select("id, account_id, recipe_slug, config")
    .eq("status", "active")
    .is("n8n_workflow_id", null);

  if (error || !rows?.length) {
    return { retried: 0, failed: 0 };
  }

  let retried = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await provisionRecipe(
        row.account_id,
        row.recipe_slug,
        (row.config as Record<string, unknown> | null) ?? null,
        row.id,
      );
      retried += 1;
    } catch {
      failed += 1;
    }
  }

  return { retried, failed };
}
