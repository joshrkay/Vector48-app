// ---------------------------------------------------------------------------
// CRM Reports — Query Functions
// All data cached 15 minutes flat (unstable_cache, revalidate: 900).
// Combines automation_events (Supabase) + GHL API for each section.
// ---------------------------------------------------------------------------

import "server-only";

import { unstable_cache } from "next/cache";

import { createServerClient } from "@/lib/supabase/server";
import { getAccountGhlCredentials } from "@/lib/ghl/token";
import { cachedGHLClient } from "@/lib/ghl/cache";
import type { GHLClientOptions } from "@/lib/ghl/types";

// ── Types ─────────────────────────────────────────────────────────────────

export type RecipePerformanceRow = {
  recipeSlug: string;
  total30d: number;
  prev30d: number;
  trend: number; // % change
};

export type LeadSourceRow = {
  source: string;
  count: number;
};

export type PipelineFunnelRow = {
  stageName: string;
  count: number;
  conversionFromPrev: number | null; // null for first stage
};

export type ContactGrowthRow = {
  weekLabel: string;
  count: number;
};

export type ResponseTimeBucket = {
  label: string;
  count: number;
};

export type ResponseTimeData = {
  buckets: ResponseTimeBucket[];
  headline: string;
};

export type ReportData = {
  recipePerformance: RecipePerformanceRow[];
  leadSources: LeadSourceRow[];
  pipelineFunnel: PipelineFunnelRow[];
  contactGrowth: ContactGrowthRow[];
  responseTimes: ResponseTimeData;
};

// ── Helpers ───────────────────────────────────────────────────────────────

function computeTrend(current: number, previous: number): number {
  return ((current - previous) / Math.max(previous, 1)) * 100;
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

// ── Recipe Performance ────────────────────────────────────────────────────

type AutomationEventSlim = { recipe_slug: string | null; created_at: string };

async function getRecipePerformance(
  accountId: string,
): Promise<RecipePerformanceRow[]> {
  const supabase = await createServerClient();
  const sixtyDaysAgo = daysAgo(60);
  const thirtyDaysAgo = daysAgo(30);

  const { data, error } = await supabase
    .from("automation_events")
    .select("recipe_slug, created_at")
    .eq("account_id", accountId)
    .gte("created_at", sixtyDaysAgo)
    .not("recipe_slug", "is", null);

  if (error) throw error;

  const rows: AutomationEventSlim[] = (data ?? []) as AutomationEventSlim[];
  const slugs = new Set(rows.map((r) => r.recipe_slug as string));

  const result: RecipePerformanceRow[] = [];

  for (const slug of Array.from(slugs)) {
    const slugRows = rows.filter((r) => r.recipe_slug === slug);
    const total30d = slugRows.filter((r) => r.created_at >= thirtyDaysAgo).length;
    const prev30d = slugRows.filter((r) => r.created_at < thirtyDaysAgo).length;

    result.push({
      recipeSlug: slug,
      total30d,
      prev30d,
      trend: computeTrend(total30d, prev30d),
    });
  }

  return result.sort((a, b) => b.total30d - a.total30d);
}

// ── Lead Sources ──────────────────────────────────────────────────────────

async function getLeadSources(
  client: ReturnType<typeof cachedGHLClient>,
  auth: GHLClientOptions,
): Promise<LeadSourceRow[]> {
  const MAX_PAGES = 20;
  const counts = new Map<string, number>();

  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await client.getContacts(
      { limit: 250, startAfterId: cursor },
      auth,
    );

    const contacts = result.contacts ?? [];
    for (const c of contacts) {
      const key = c.source?.trim() || "Unknown";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const nextCursor =
      result.meta?.startAfterId ??
      (contacts.length === 250 ? contacts[contacts.length - 1]?.id : null);

    if (!nextCursor || contacts.length < 250) break;
    cursor = nextCursor;
  }

  const sorted = Array.from(counts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  if (sorted.length <= 5) return sorted;

  const top5 = sorted.slice(0, 5);
  const otherCount = sorted.slice(5).reduce((acc, row) => acc + row.count, 0);
  return [...top5, { source: "Other", count: otherCount }];
}

// ── Pipeline Conversion Funnel ────────────────────────────────────────────

async function getPipelineConversion(
  client: ReturnType<typeof cachedGHLClient>,
  auth: GHLClientOptions,
): Promise<PipelineFunnelRow[]> {
  const { pipelines } = await client.getPipelines(auth);

  if (!pipelines || pipelines.length === 0) return [];

  // Use the first pipeline
  const pipeline = pipelines[0];
  const stages = [...pipeline.stages].sort((a, b) => a.position - b.position);

  if (stages.length === 0) return [];

  // Paginate all open opportunities for this pipeline
  const MAX_PAGES = 20;
  const stageCounts = new Map<string, number>(stages.map((s) => [s.id, 0]));

  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await client.getOpportunities(
      {
        pipelineId: pipeline.id,
        status: "open",
        limit: 250,
        startAfterId: cursor,
      },
      auth,
    );

    const opportunities = result.opportunities ?? [];
    for (const opp of opportunities) {
      if (stageCounts.has(opp.pipelineStageId)) {
        stageCounts.set(opp.pipelineStageId, stageCounts.get(opp.pipelineStageId)! + 1);
      }
    }

    const nextCursor =
      result.meta?.startAfterId ??
      (opportunities.length === 250 ? opportunities[opportunities.length - 1]?.id : null);

    if (!nextCursor || opportunities.length < 250) break;
    cursor = nextCursor;
  }

  const rows: PipelineFunnelRow[] = [];
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const count = stageCounts.get(stage.id) ?? 0;
    const prevCount = i > 0 ? (stageCounts.get(stages[i - 1].id) ?? 0) : null;

    rows.push({
      stageName: stage.name,
      count,
      conversionFromPrev:
        prevCount !== null && prevCount > 0
          ? Math.round((count / prevCount) * 100) / 100
          : null,
    });
  }

  return rows;
}

// ── Contact Growth ────────────────────────────────────────────────────────

function getWeekKey(dateStr: string): number {
  const ms = new Date(dateStr).getTime();
  // Floor to week boundary (Thursday epoch = week 0, but any consistent epoch is fine)
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
}

function weekLabel(weekKey: number): string {
  // Convert week key back to a Monday date
  const date = new Date(weekKey * 7 * 24 * 60 * 60 * 1000);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function getContactGrowth(
  client: ReturnType<typeof cachedGHLClient>,
  auth: GHLClientOptions,
): Promise<ContactGrowthRow[]> {
  const twelveWeeksAgo = daysAgo(84);
  const MAX_PAGES = 20;
  const weekCounts = new Map<number, number>();

  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await client.getContacts(
      {
        limit: 250,
        startAfterId: cursor,
        "dateAdded[gte]": twelveWeeksAgo,
      },
      auth,
    );

    const contacts = result.contacts ?? [];
    for (const c of contacts) {
      const key = getWeekKey(c.dateAdded);
      weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1);
    }

    const nextCursor =
      result.meta?.startAfterId ??
      (contacts.length === 250 ? contacts[contacts.length - 1]?.id : null);

    if (!nextCursor || contacts.length < 250) break;
    cursor = nextCursor;
  }

  // Build 12-week series, filling gaps with 0
  const nowKey = getWeekKey(new Date().toISOString());
  const rows: ContactGrowthRow[] = [];
  for (let i = 11; i >= 0; i--) {
    const key = nowKey - i;
    rows.push({
      weekLabel: weekLabel(key),
      count: weekCounts.get(key) ?? 0,
    });
  }

  return rows;
}

// ── Response Times ────────────────────────────────────────────────────────

// Two-query in-memory join:
// 1. Load all contact_created events (last 30 days)
// 2. Load all lead_outreach_sent events (last 30 days)
// 3. For each contact_created, find earliest outreach AFTER creation
// 4. Bucket the delta, compute headline %

const BUCKETS = [
  { label: "<2 min", maxSeconds: 120 },
  { label: "2–5 min", maxSeconds: 300 },
  { label: "5–15 min", maxSeconds: 900 },
  { label: "15–60 min", maxSeconds: 3600 },
  { label: "1h+", maxSeconds: Infinity },
] as const;

async function getResponseTimes(accountId: string): Promise<ResponseTimeData> {
  const supabase = await createServerClient();
  const thirtyDaysAgo = daysAgo(30);

  const [createdResult, outreachResult] = await Promise.all([
    supabase
      .from("automation_events")
      .select("contact_id, created_at")
      .eq("account_id", accountId)
      .eq("event_type", "contact_created")
      .gte("created_at", thirtyDaysAgo)
      .not("contact_id", "is", null),

    supabase
      .from("automation_events")
      .select("contact_id, created_at")
      .eq("account_id", accountId)
      .eq("event_type", "lead_outreach_sent")
      .gte("created_at", thirtyDaysAgo)
      .not("contact_id", "is", null),
  ]);

  if (createdResult.error) throw createdResult.error;
  if (outreachResult.error) throw outreachResult.error;

  type ContactEventRow = { contact_id: string | null; created_at: string };
  const createdRows = (createdResult.data ?? []) as ContactEventRow[];
  const outreachRows = (outreachResult.data ?? []) as ContactEventRow[];

  // Build Map<contactId, sorted outreach timestamps>
  const outreachByContact = new Map<string, number[]>();
  for (const row of outreachRows) {
    const ts = new Date(row.created_at).getTime();
    const id = row.contact_id as string;
    const existing = outreachByContact.get(id) ?? [];
    existing.push(ts);
    outreachByContact.set(id, existing);
  }

  // Sort each contact's outreach timestamps ascending
  outreachByContact.forEach((times, id) => {
    outreachByContact.set(id, times.sort((a: number, b: number) => a - b));
  });

  // Count buckets
  const bucketCounts: number[] = BUCKETS.map(() => 0);
  let totalContacted = 0;

  for (const row of createdRows) {
    const contactId = row.contact_id as string;
    const createdAt = new Date(row.created_at).getTime();
    const outreachTimes = outreachByContact.get(contactId) ?? [];

    // Find earliest outreach at or after contact creation
    const firstOutreach = outreachTimes.find((t) => t >= createdAt);
    if (firstOutreach === undefined) continue;

    const deltaSeconds = (firstOutreach - createdAt) / 1000;
    if (deltaSeconds < 0) continue; // skip inversions

    totalContacted++;
    for (let i = 0; i < BUCKETS.length; i++) {
      if (deltaSeconds < BUCKETS[i].maxSeconds) {
        bucketCounts[i]++;
        break;
      }
    }
  }

  const under2min = bucketCounts[0];
  const headlinePct =
    totalContacted > 0 ? Math.round((under2min / totalContacted) * 100) : 0;

  const headline =
    totalContacted > 0
      ? `${headlinePct}% of leads contacted in under 2 minutes`
      : "No response time data for the last 30 days";

  return {
    buckets: BUCKETS.map((b, i) => ({ label: b.label, count: bucketCounts[i] })),
    headline,
  };
}

// ── Public cached entry point ─────────────────────────────────────────────

export const getReportData = unstable_cache(
  async (accountId: string): Promise<ReportData> => {
    const client = cachedGHLClient(accountId);
    let auth: GHLClientOptions | null = null;

    try {
      const { locationId, accessToken } = await getAccountGhlCredentials(accountId);
      auth = { locationId, apiKey: accessToken };
    } catch {
      auth = null;
    }

    const [recipePerformance, leadSources, pipelineFunnel, contactGrowth, responseTimes] =
      await Promise.all([
        getRecipePerformance(accountId).catch((): RecipePerformanceRow[] => []),
        auth
          ? getLeadSources(client, auth).catch((): LeadSourceRow[] => [])
          : Promise.resolve([] as LeadSourceRow[]),
        auth
          ? getPipelineConversion(client, auth).catch((): PipelineFunnelRow[] => [])
          : Promise.resolve([] as PipelineFunnelRow[]),
        auth
          ? getContactGrowth(client, auth).catch((): ContactGrowthRow[] => [])
          : Promise.resolve([] as ContactGrowthRow[]),
        getResponseTimes(accountId).catch(
          (): ResponseTimeData => ({
            buckets: BUCKETS.map((b) => ({ label: b.label, count: 0 })),
            headline: "Response time data unavailable",
          }),
        ),
      ]);

    return { recipePerformance, leadSources, pipelineFunnel, contactGrowth, responseTimes };
  },
  ["crm:reports"],
  { revalidate: 900 },
);
