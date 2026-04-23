import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export interface WebhookFailureRow {
  id: string;
  provider: "ghl" | "stripe";
  account_id: string | null;
  reason: string;
  event_type: string | null;
  payload_hash: string | null;
  created_at: string;
}

export interface WebhookFailuresQueryOptions {
  /** `all` | `ghl` | `stripe` — defaults to all. */
  provider?: "ghl" | "stripe";
  /** ISO timestamp; rows with created_at >= since are included. */
  since?: string;
  /** Default 100, capped at 500. */
  limit?: number;
}

export interface WebhookFailuresSummary {
  last24h: number;
  last7d: number;
  last30d: number;
}

/**
 * List recent webhook signature / auth failures. Bypasses RLS via the
 * service-role admin client — callers MUST have already run `isOpsAdmin`
 * before invoking this.
 */
export async function listWebhookFailures(
  options: WebhookFailuresQueryOptions = {},
): Promise<WebhookFailureRow[]> {
  const supabase = createAdminClient();
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);

  let query = supabase
    .from("webhook_failures")
    .select("id, provider, account_id, reason, event_type, payload_hash, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options.provider) {
    query = query.eq("provider", options.provider);
  }
  if (options.since) {
    query = query.gte("created_at", options.since);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[webhook-failures] query failed", error.message);
    return [];
  }
  return (data ?? []) as WebhookFailureRow[];
}

/**
 * Bucketed counts for the dashboard header. One query per window is cheaper
 * than a raw COUNT(*) DISTINCT date_trunc since the table is small and
 * already indexed on created_at.
 */
export async function summarizeWebhookFailures(
  provider?: "ghl" | "stripe",
): Promise<WebhookFailuresSummary> {
  const supabase = createAdminClient();

  const now = Date.now();
  const windows = {
    last24h: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    last7d: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
    last30d: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const counts = await Promise.all(
    Object.entries(windows).map(async ([_key, since]) => {
      let q = supabase
        .from("webhook_failures")
        .select("*", { count: "exact", head: true })
        .gte("created_at", since);
      if (provider) q = q.eq("provider", provider);
      const { count, error } = await q;
      if (error) {
        console.error("[webhook-failures] summary failed", error.message);
        return 0;
      }
      return count ?? 0;
    }),
  );

  return {
    last24h: counts[0],
    last7d: counts[1],
    last30d: counts[2],
  };
}
