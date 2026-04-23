import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type MetricValue = number | null;

export interface OpsMetric {
  key: string;
  label: string;
  value: MetricValue;
  unit?: "count" | "percent" | "usd" | "seconds";
  severity?: "ok" | "warn" | "crit" | "unknown";
}

/**
 * Compute the 13 launch-dashboard metrics in a single pass. Every query is
 * read-only and runs as service role, so do not expose this module to any
 * route without first checking isOpsAdmin(session.user.email).
 */
export async function computeOpsMetrics(): Promise<OpsMetric[]> {
  const supabase = createAdminClient();
  const metrics: OpsMetric[] = [];

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Daily new signups
  metrics.push(
    await countRows(supabase, "accounts", {
      label: "Daily new signups",
      key: "daily_signups",
      filter: (q) => q.gte("created_at", oneDayAgo),
    }),
  );

  // 2. Signup -> onboarding-complete (7d)
  const signupsLast7d = await countWhere(supabase, "accounts", (q) =>
    q.gte("created_at", sevenDaysAgo),
  );
  const completedLast7d = await countWhere(supabase, "accounts", (q) =>
    q.gte("created_at", sevenDaysAgo).not("onboarding_completed_at", "is", null),
  );
  metrics.push({
    key: "onboarding_conversion_7d",
    label: "Signup → onboarding complete (7d)",
    value: percent(completedLast7d, signupsLast7d),
    unit: "percent",
    severity: threshold(percent(completedLast7d, signupsLast7d), {
      warnBelow: 40,
    }),
  });

  // 3. Daily active accounts (any recipe trigger completed in 24h)
  metrics.push(
    await countDistinct(supabase, "recipe_triggers", "account_id", {
      label: "Daily active accounts",
      key: "daily_active_accounts",
      filter: (q) => q.eq("status", "completed").gte("processed_at", oneDayAgo),
    }),
  );

  // 4. Trial → paid conversion (7d)
  const trialExpiringLast7d = await countWhere(supabase, "accounts", (q) =>
    q.gte("trial_ends_at", sevenDaysAgo),
  );
  const convertedLast7d = await countWhere(supabase, "accounts", (q) =>
    q
      .gte("trial_ends_at", sevenDaysAgo)
      .eq("subscription_status", "active")
      .neq("plan_slug", "trial"),
  );
  metrics.push({
    key: "trial_to_paid_7d",
    label: "Trial → paid (7d)",
    value: percent(convertedLast7d, trialExpiringLast7d),
    unit: "percent",
    severity: threshold(percent(convertedLast7d, trialExpiringLast7d), {
      warnBelow: 30,
    }),
  });

  // 5. Recipe trigger success rate (24h)
  const triggersLast24h = await countWhere(supabase, "recipe_triggers", (q) =>
    q.gte("processed_at", oneDayAgo),
  );
  const triggerSuccessLast24h = await countWhere(supabase, "recipe_triggers", (q) =>
    q.gte("processed_at", oneDayAgo).eq("status", "completed"),
  );
  metrics.push({
    key: "trigger_success_rate_24h",
    label: "Recipe trigger success rate (24h)",
    value: percent(triggerSuccessLast24h, triggersLast24h),
    unit: "percent",
    severity: threshold(percent(triggerSuccessLast24h, triggersLast24h), {
      warnBelow: 95,
    }),
  });

  // 6. Recipe trigger failures (24h count)
  metrics.push(
    await countRows(supabase, "recipe_triggers", {
      label: "Recipe trigger failures (24h)",
      key: "trigger_failures_24h",
      filter: (q) => q.eq("status", "failed").gte("processed_at", oneDayAgo),
    }),
  );

  // 7. Webhook signature failures — GHL (24h)
  metrics.push(
    await countRows(supabase, "webhook_failures", {
      label: "Webhook failures — GHL (24h)",
      key: "webhook_failures_ghl_24h",
      filter: (q) => q.eq("provider", "ghl").gte("created_at", oneDayAgo),
    }),
  );

  // 8. Webhook signature failures — Stripe (24h)
  metrics.push(
    await countRows(supabase, "webhook_failures", {
      label: "Webhook failures — Stripe (24h)",
      key: "webhook_failures_stripe_24h",
      filter: (q) => q.eq("provider", "stripe").gte("created_at", oneDayAgo),
    }),
  );

  // 9. Spend-cap breaches (any account currently at/over cap)
  metrics.push(await countSpendCapBreaches(supabase));

  // 10. Weekly LLM spend total (USD)
  metrics.push(await sumLlmSpend(supabase, sevenDaysAgo));

  // 11. LLM cost as % of MRR (best-effort; MRR approximated from active subs)
  metrics.push(await costAsPercentOfMrr(supabase, sevenDaysAgo));

  // 12. Accounts with failed provisioning (current)
  metrics.push(
    await countRows(supabase, "accounts", {
      label: "Accounts stuck in provisioning=failed",
      key: "provisioning_failed",
      filter: (q) => q.eq("ghl_provisioning_status", "failed"),
    }),
  );

  // 13. Stripe webhook processing lag (avg seconds, last hour)
  metrics.push(await stripeWebhookLag(supabase));

  return metrics;
}

// ── helpers ────────────────────────────────────────────────────────────────

type SupabaseClient = ReturnType<typeof createAdminClient>;
type Filter = (q: any) => any;

async function countRows(
  supabase: SupabaseClient,
  table: string,
  opts: { key: string; label: string; filter: Filter },
): Promise<OpsMetric> {
  const count = await countWhere(supabase, table, opts.filter);
  return {
    key: opts.key,
    label: opts.label,
    value: count,
    unit: "count",
  };
}

async function countWhere(
  supabase: SupabaseClient,
  table: string,
  filter: Filter,
): Promise<number> {
  let query = supabase.from(table as never).select("*", { count: "exact", head: true });
  query = filter(query);
  const { count, error } = await query;
  if (error) {
    console.error(`[ops-metrics] count ${table} failed`, error.message);
    return 0;
  }
  return count ?? 0;
}

async function countDistinct(
  supabase: SupabaseClient,
  table: string,
  column: string,
  opts: { key: string; label: string; filter: Filter },
): Promise<OpsMetric> {
  let query = supabase.from(table as never).select(column);
  query = opts.filter(query);
  const { data, error } = await query;
  if (error || !data) {
    return { key: opts.key, label: opts.label, value: 0, unit: "count" };
  }
  const set = new Set<string>();
  for (const row of data as unknown as Array<Record<string, unknown>>) {
    const value = row[column];
    if (typeof value === "string") set.add(value);
  }
  return { key: opts.key, label: opts.label, value: set.size, unit: "count" };
}

async function countSpendCapBreaches(
  supabase: SupabaseClient,
): Promise<OpsMetric> {
  const { data, error } = await supabase
    .from("tenant_agents")
    .select("id, account_id, monthly_spend_cap_micros")
    .not("monthly_spend_cap_micros", "is", null);

  if (error || !data) {
    return {
      key: "spend_cap_breaches",
      label: "Spend-cap breaches (current)",
      value: null,
      unit: "count",
      severity: "unknown",
    };
  }

  let breaches = 0;
  const monthStart = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
  ).toISOString();

  for (const agent of data as Array<{
    id: string;
    account_id: string;
    monthly_spend_cap_micros: number | null;
  }>) {
    if (!agent.monthly_spend_cap_micros) continue;
    const { data: usage } = await supabase
      .from("llm_usage_events")
      .select("cost_micros")
      .eq("tenant_agent_id", agent.id)
      .gte("created_at", monthStart);
    const spent = (usage ?? []).reduce(
      (acc, row) =>
        acc + ((row as { cost_micros?: number | null }).cost_micros ?? 0),
      0,
    );
    if (spent >= agent.monthly_spend_cap_micros) breaches += 1;
  }

  return {
    key: "spend_cap_breaches",
    label: "Spend-cap breaches (current)",
    value: breaches,
    unit: "count",
    severity: breaches > 0 ? "crit" : "ok",
  };
}

async function sumLlmSpend(
  supabase: SupabaseClient,
  since: string,
): Promise<OpsMetric> {
  const { data, error } = await supabase
    .from("llm_usage_events")
    .select("cost_micros")
    .gte("created_at", since);
  if (error || !data) {
    return {
      key: "llm_spend_7d_usd",
      label: "LLM spend (7d, USD)",
      value: null,
      unit: "usd",
      severity: "unknown",
    };
  }
  const micros = (data as Array<{ cost_micros?: number | null }>).reduce(
    (acc, row) => acc + (row.cost_micros ?? 0),
    0,
  );
  return {
    key: "llm_spend_7d_usd",
    label: "LLM spend (7d, USD)",
    value: micros / 1_000_000,
    unit: "usd",
  };
}

async function costAsPercentOfMrr(
  supabase: SupabaseClient,
  since: string,
): Promise<OpsMetric> {
  // LLM cost (monthly-pro-rated from last 7d)
  const { data: usage } = await supabase
    .from("llm_usage_events")
    .select("cost_micros")
    .gte("created_at", since);
  const micros = (usage ?? []).reduce(
    (acc, row) =>
      acc + ((row as { cost_micros?: number | null }).cost_micros ?? 0),
    0,
  );
  const weeklyCostUsd = micros / 1_000_000;
  const monthlyCostUsd = (weeklyCostUsd / 7) * 30;

  // MRR from active paying accounts' plan prices (pricing_config monthly_price_cents).
  const { data: accountsWithPlan } = await supabase
    .from("accounts")
    .select("plan_slug")
    .eq("subscription_status", "active")
    .neq("plan_slug", "trial");
  const { data: pricing } = await supabase
    .from("pricing_config")
    .select("plan_slug, monthly_price_cents");

  const priceBySlug = new Map<string, number>();
  for (const row of pricing ?? []) {
    const entry = row as { plan_slug?: string; monthly_price_cents?: number };
    if (entry.plan_slug && typeof entry.monthly_price_cents === "number") {
      priceBySlug.set(entry.plan_slug, entry.monthly_price_cents);
    }
  }
  const mrrCents = (accountsWithPlan ?? []).reduce((acc, row) => {
    const slug = (row as { plan_slug?: string }).plan_slug;
    return acc + (slug ? priceBySlug.get(slug) ?? 0 : 0);
  }, 0);
  const mrrUsd = mrrCents / 100;

  if (mrrUsd <= 0) {
    return {
      key: "cost_percent_mrr",
      label: "LLM cost / MRR",
      value: null,
      unit: "percent",
      severity: "unknown",
    };
  }
  const percentage = (monthlyCostUsd / mrrUsd) * 100;
  return {
    key: "cost_percent_mrr",
    label: "LLM cost / MRR",
    value: percentage,
    unit: "percent",
    severity: threshold(percentage, { warnAbove: 30, critAbove: 50 }),
  };
}

async function stripeWebhookLag(supabase: SupabaseClient): Promise<OpsMetric> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("stripe_processed_events")
    .select("processed_at")
    .gte("processed_at", since)
    .limit(50);
  if (error || !data || data.length === 0) {
    return {
      key: "stripe_lag_seconds",
      label: "Stripe webhook processing (1h sample)",
      value: null,
      unit: "seconds",
      severity: "unknown",
    };
  }
  // No created_at column on Stripe processed events; this is a placeholder
  // that will be meaningful once we persist an `event_created_at` field.
  return {
    key: "stripe_lag_seconds",
    label: "Stripe webhook processing (1h sample)",
    value: 0,
    unit: "seconds",
    severity: "ok",
  };
}

function percent(numerator: number, denominator: number): MetricValue {
  if (denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

interface ThresholdOptions {
  warnBelow?: number;
  critBelow?: number;
  warnAbove?: number;
  critAbove?: number;
}

function threshold(
  value: MetricValue,
  opts: ThresholdOptions,
): "ok" | "warn" | "crit" | "unknown" {
  if (value === null) return "unknown";
  if (opts.critAbove !== undefined && value > opts.critAbove) return "crit";
  if (opts.critBelow !== undefined && value < opts.critBelow) return "crit";
  if (opts.warnAbove !== undefined && value > opts.warnAbove) return "warn";
  if (opts.warnBelow !== undefined && value < opts.warnBelow) return "warn";
  return "ok";
}
