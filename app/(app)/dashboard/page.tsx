import { Suspense } from "react";
import { createServerClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";
import { redirect } from "next/navigation";
import { getSessionData } from "@/lib/data/session";

type DashboardStatCard = {
  label: string;
  value: string;
  periodLabel: string;
};

type GHLSnapshot = {
  integrationStatus: "connected" | "disconnected" | "error";
  provisioningStatus: string;
  healthStatus: string;
  lastHealthCheck: string | null;
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

async function getStatCards(accountId: string): Promise<DashboardStatCard[]> {
  const supabase = await createServerClient();

  const [eventsResult, activeRecipesResult] = await Promise.all([
    supabase
      .from("automation_events")
      .select("event_type", { count: "exact", head: true })
      .eq("account_id", accountId),
    supabase
      .from("recipe_activations")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("status", "active"),
  ]);

  const eventCount = eventsResult.count ?? 0;
  const activeRecipesCount = activeRecipesResult.count ?? 0;

  return [
    { label: "Calls Handled", value: String(eventCount), periodLabel: "Total events" },
    { label: "Leads Contacted", value: String(eventCount), periodLabel: "Total events" },
    { label: "Reviews Sent", value: "0", periodLabel: "This week" },
    {
      label: "Bookings Confirmed",
      value: String(activeRecipesCount),
      periodLabel: "Active recipes",
    },
  ];
}

async function getGHLSnapshot(accountId: string): Promise<GHLSnapshot> {
  const supabase = await createServerClient();

  const [accountResult, integrationResult] = await Promise.all([
    supabase
      .from("accounts")
      .select("ghl_provisioning_status, ghl_health_status, ghl_last_health_check")
      .eq("id", accountId)
      .single(),
    supabase
      .from("integrations")
      .select("status")
      .eq("account_id", accountId)
      .eq("provider", "ghl")
      .maybeSingle(),
  ]);

  return {
    integrationStatus: integrationResult.data?.status ?? "disconnected",
    provisioningStatus: accountResult.data?.ghl_provisioning_status ?? "pending",
    healthStatus: accountResult.data?.ghl_health_status ?? "unknown",
    lastHealthCheck: accountResult.data?.ghl_last_health_check ?? null,
  };
}

function DashboardStatCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-2xl border border-[var(--v48-border)] bg-white p-5 animate-pulse"
        >
          <div className="h-3 w-24 rounded bg-gray-200" />
          <div className="mt-3 h-8 w-14 rounded bg-gray-200" />
          <div className="mt-3 h-3 w-16 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

function DashboardGHLSnapshotSkeleton() {
  return (
    <div className="min-h-[280px] rounded-2xl border border-[var(--v48-border)] bg-white p-5 animate-pulse">
      <div className="h-5 w-40 rounded bg-gray-200" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="h-4 w-full rounded bg-gray-200" />
        ))}
      </div>
    </div>
  );
}

async function DashboardStatCardsSection({
  statCardsPromise,
}: {
  statCardsPromise: Promise<DashboardStatCard[]>;
}) {
  const statCards = await statCardsPromise;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {statCards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl border border-[var(--v48-border)] bg-white p-5"
        >
          <p className="text-[13px] text-[var(--text-secondary)]">{card.label}</p>
          <p className="mt-1 font-heading text-[32px] font-bold">{card.value}</p>
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{card.periodLabel}</p>
        </div>
      ))}
    </div>
  );
}

async function DashboardGHLSnapshotSection({
  snapshotPromise,
}: {
  snapshotPromise: Promise<GHLSnapshot>;
}) {
  const snapshot = await snapshotPromise;

  return (
    <section className="rounded-2xl border border-[var(--v48-border)] bg-white p-5">
      <h2 className="font-heading text-xl font-semibold">GHL Snapshot</h2>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-[var(--text-secondary)]">Integration</dt>
          <dd className="font-medium capitalize">{snapshot.integrationStatus}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-[var(--text-secondary)]">Provisioning</dt>
          <dd className="font-medium capitalize">{snapshot.provisioningStatus}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-[var(--text-secondary)]">Health</dt>
          <dd className="font-medium capitalize">{snapshot.healthStatus}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-[var(--text-secondary)]">Last health check</dt>
          <dd className="font-medium">
            {snapshot.lastHealthCheck
              ? new Date(snapshot.lastHealthCheck).toLocaleString()
              : "Not available"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export default async function DashboardPage() {
  const { user, account } = await getSessionData();

  if (!user || !account) {
    redirect("/login");
  }

  const greeting = getGreeting();
  const headline = account.business_name ? `${greeting}, ${account.business_name}` : greeting;

  const statCardsPromise = getStatCards(account.id);
  const snapshotPromise = getGHLSnapshot(account.id);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-[28px] font-bold">{headline}</h1>
        <SignOutButton />
      </div>

      <section className="mt-6 rounded-2xl border border-[var(--v48-border)] bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Alerts will appear here when recipes require attention.
      </section>

      <section className="mt-6">
        <Suspense fallback={<DashboardStatCardsSkeleton />}>
          <DashboardStatCardsSection statCardsPromise={statCardsPromise} />
        </Suspense>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--v48-border)] bg-white p-5">
        <h2 className="font-heading text-lg font-semibold">Active Recipes</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Activate recipes to stream automation events into your dashboard.
        </p>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--v48-border)] bg-white p-5">
          <h2 className="font-heading text-lg font-semibold">Activity Feed</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            No activity yet. Activate a recipe to get started.
          </p>
        </div>

        <Suspense fallback={<DashboardGHLSnapshotSkeleton />}>
          <DashboardGHLSnapshotSection snapshotPromise={snapshotPromise} />
        </Suspense>
      </section>
    </div>
  );
}
