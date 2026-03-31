// ---------------------------------------------------------------------------
// Aggregated integration status for Settings + dashboard (server-only).
// ---------------------------------------------------------------------------
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type {
  GhlUiStatus,
  IntegrationStatusPayload,
} from "./integrationStatusTypes";

export type { IntegrationStatusPayload, GhlUiStatus } from "./integrationStatusTypes";

/** Subset of `accounts` row used by integration status (matches common SELECT lists). */
export type IntegrationStatusAccountInput = Pick<
  Database["public"]["Tables"]["accounts"]["Row"],
  | "id"
  | "ghl_provisioning_status"
  | "ghl_location_id"
  | "ghl_token_encrypted"
  | "ghl_last_synced_at"
  | "ghl_voice_agent_id"
  | "voice_gender"
  | "greeting_text"
  | "phone"
>;

function maskId(id: string | null): string | null {
  if (!id) return null;
  const t = id.trim();
  if (t.length <= 8) return t;
  return `${t.slice(0, 4)}...${t.slice(-4)}`;
}

function mapGhlProvisioning(s: string): GhlUiStatus {
  if (s === "complete") return "connected";
  if (s === "failed") return "failed";
  return "pending";
}

// ── n8n health check — module-level cache (60 s TTL) ──────────────────────
// Avoids a live outbound HTTP call on every page load.
let n8nCacheResult = false;
let n8nCacheAt = 0;
const N8N_CACHE_TTL_MS = 60_000;

async function checkN8nHealth(healthUrl: string): Promise<boolean> {
  const now = Date.now();
  if (now - n8nCacheAt < N8N_CACHE_TTL_MS) return n8nCacheResult;

  try {
    const res = await fetch(healthUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    n8nCacheResult = res.ok;
  } catch {
    n8nCacheResult = false;
  }
  n8nCacheAt = Date.now();
  return n8nCacheResult;
}

// ── Main export ────────────────────────────────────────────────────────────

export async function buildIntegrationStatus(
  supabase: SupabaseClient<Database>,
  account: IntegrationStatusAccountInput,
): Promise<IntegrationStatusPayload> {
  const prov = account.ghl_provisioning_status;
  const ghlStatus = mapGhlProvisioning(prov);

  const { count } = await supabase
    .from("automation_events")
    .select("*", { count: "exact", head: true })
    .eq("account_id", account.id);

  const base =
    process.env.N8N_WEBHOOK_BASE_URL?.trim() ||
    process.env.N8N_BASE_URL?.trim() ||
    null;
  const normalizedBase = base ? base.replace(/\/$/, "") : null;
  const healthUrl = normalizedBase ? `${normalizedBase}/healthz` : null;

  const n8nConnected = healthUrl ? await checkN8nHealth(healthUrl) : false;

  const provisioned =
    prov === "complete" &&
    Boolean(account.ghl_location_id) &&
    Boolean(account.ghl_token_encrypted);

  const hasVoiceConfig =
    Boolean(account.voice_gender) &&
    Boolean(account.greeting_text?.trim());

  return {
    ghl: {
      status: ghlStatus,
      maskedLocationId: maskId(account.ghl_location_id),
      lastSyncedAt: account.ghl_last_synced_at,
    },
    voiceAgent: {
      show: provisioned,
      status: hasVoiceConfig ? "active" : "not_configured",
      maskedAgentId: maskId(account.ghl_voice_agent_id),
      voiceGender: account.voice_gender,
      testCallTel: account.phone?.trim() || null,
    },
    n8n: {
      connected: n8nConnected,
      webhookBaseUrl: normalizedBase,
      recipeExecutionCount: count ?? 0,
    },
  };
}
