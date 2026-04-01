import { createServerClient } from "@/lib/supabase/server";

type StatCard = {
  current: number;
  previous: number;
  trend: number;
};

type StatCards = {
  callsHandled: StatCard;
  leadsContacted: StatCard;
  reviewsRequested: StatCard;
  apptsConfirmed: StatCard;
};

type TimeWindow = {
  start: string;
  end: string;
};

type Windows = {
  current: TimeWindow;
  previous: TimeWindow;
};

type SupabaseClient = Awaited<ReturnType<typeof createServerClient>>;

function buildWindows(now: Date): Windows {
  const dayMs = 24 * 60 * 60 * 1000;

  const currentStart = new Date(now.getTime() - 30 * dayMs).toISOString();
  const currentEnd = now.toISOString();

  const previousStart = new Date(now.getTime() - 60 * dayMs).toISOString();
  const previousEnd = currentStart;

  return {
    current: { start: currentStart, end: currentEnd },
    previous: { start: previousStart, end: previousEnd },
  };
}

function computeTrend(current: number, previous: number): number {
  return ((current - previous) / Math.max(previous, 1)) * 100;
}

async function countEventsInWindow(
  supabase: SupabaseClient,
  accountId: string,
  eventType: string,
  window: TimeWindow,
): Promise<number> {
  const { count, error } = await supabase
    .from("automation_events")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("event_type", eventType)
    .gte("created_at", window.start)
    .lt("created_at", window.end);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function countDistinctContactsInWindow(
  supabase: SupabaseClient,
  accountId: string,
  eventType: string,
  window: TimeWindow,
): Promise<number> {
  const { data, error } = await supabase
    .from("automation_events")
    .select("contact_id")
    .eq("account_id", accountId)
    .eq("event_type", eventType)
    .gte("created_at", window.start)
    .lt("created_at", window.end)
    .not("contact_id", "is", null);

  if (error) {
    throw error;
  }

  return new Set((data ?? []).map((row) => row.contact_id)).size;
}

async function buildStatCardFromCountEvent(
  supabase: SupabaseClient,
  accountId: string,
  eventType: string,
  windows: Windows,
): Promise<StatCard> {
  const [current, previous] = await Promise.all([
    countEventsInWindow(supabase, accountId, eventType, windows.current),
    countEventsInWindow(supabase, accountId, eventType, windows.previous),
  ]);

  return {
    current,
    previous,
    trend: computeTrend(current, previous),
  };
}

async function buildStatCardFromDistinctContacts(
  supabase: SupabaseClient,
  accountId: string,
  eventType: string,
  windows: Windows,
): Promise<StatCard> {
  const [current, previous] = await Promise.all([
    countDistinctContactsInWindow(supabase, accountId, eventType, windows.current),
    countDistinctContactsInWindow(supabase, accountId, eventType, windows.previous),
  ]);

  return {
    current,
    previous,
    trend: computeTrend(current, previous),
  };
}

export async function getStatCards(accountId: string): Promise<StatCards> {
  const supabase = await createServerClient();
  const windows = buildWindows(new Date());

  const [callsHandled, leadsContacted, reviewsRequested, apptsConfirmed] =
    await Promise.all([
      buildStatCardFromCountEvent(supabase, accountId, "call_answered", windows),
      buildStatCardFromDistinctContacts(
        supabase,
        accountId,
        "lead_outreach_sent",
        windows,
      ),
      buildStatCardFromCountEvent(
        supabase,
        accountId,
        "review_request_sent",
        windows,
      ),
      buildStatCardFromCountEvent(
        supabase,
        accountId,
        "appointment_confirmed",
        windows,
      ),
    ]);

  return {
    callsHandled,
    leadsContacted,
    reviewsRequested,
    apptsConfirmed,
  };
}
