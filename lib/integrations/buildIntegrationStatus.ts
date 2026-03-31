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

export async function buildIntegrationStatus(
  supabase: SupabaseClient<Database>,
  account: Database["public"]["Tables"]["accounts"]["Row"],
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

  let n8nConnected = false;
  if (healthUrl) {
    try {
      const res = await fetch(healthUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(8000),
      });
      n8nConnected = res.ok;
    } catch {
      n8nConnected = false;
    }
  }

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
