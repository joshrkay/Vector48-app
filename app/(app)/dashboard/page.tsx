import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";
import { ActiveRecipesStrip } from "@/components/dashboard/ActiveRecipesStrip";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { AlertBanner } from "@/components/dashboard/AlertBanner";
import { ProvisioningBanner } from "@/components/dashboard/ProvisioningBanner";
import { GHLSummary } from "@/components/dashboard/GHLSummary";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { getStatCards } from "@/lib/dashboard/statsQuery";
import { isAlertResolved } from "@/lib/dashboard/alerts";
import { requireAccountForUser } from "@/lib/auth/account";
import { createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type AutomationEvent = Database["public"]["Tables"]["automation_events"]["Row"];
const WARMUP_WINDOW_MS = 24 * 60 * 60 * 1000;

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const session = await requireAccountForUser(supabase);
  if (!session) redirect("/login");

  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name, ghl_provisioning_status, ghl_provisioning_error, created_at")
    .eq("id", session.accountId)
    .maybeSingle();

  if (!account) redirect("/login");

  let query = supabase
    .from("automation_events")
    .select(
      "id, account_id, recipe_slug, event_type, ghl_event_type, ghl_event_id, contact_id, contact_phone, contact_name, summary, detail, created_at",
    )
    .eq("account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(21);

  const { data: eventRows } = await query;

  const initialRows = (eventRows ?? []) as AutomationEvent[];
  const initialItems = initialRows.slice(0, 20);
  const initialNextCursor =
    initialRows.length > 20 ? initialItems[initialItems.length - 1]?.created_at ?? null : null;

  const { data: activeRecipes } = await supabase
    .from("recipe_activations")
    .select("recipe_slug, last_triggered_at")
    .eq("account_id", account.id)
    .eq("status", "active")
    .order("last_triggered_at", { ascending: false });

  const { data: alertRows } = await supabase
    .from("automation_events")
    .select("id, account_id, recipe_slug, event_type, ghl_event_type, ghl_event_id, contact_id, contact_phone, contact_name, summary, detail, created_at")
    .eq("account_id", account.id)
    .eq("event_type", "alert")
    .order("created_at", { ascending: false })
    .limit(3);

  const stats = await getStatCards(account.id);
  const statCards = [
    { label: "Calls Handled", value: stats.callsHandled.current },
    { label: "Leads Contacted", value: stats.leadsContacted.current },
    { label: "Reviews Sent", value: stats.reviewsRequested.current },
    { label: "Bookings Confirmed", value: stats.apptsConfirmed.current },
  ];
  const allStatsZero = statCards.every((card) => card.value === 0);
  const unresolvedAlerts = (alertRows ?? []).filter(
    (row) => !isAlertResolved(row.detail),
  ) as AutomationEvent[];
  const provisioningAlert =
    account.ghl_provisioning_status === "failed"
      ? ({
          id: `ghl-provisioning-failed:${account.id}`,
          account_id: account.id,
          recipe_slug: null,
          event_type: "alert",
          ghl_event_type: null,
          ghl_event_id: null,
          contact_id: null,
          contact_phone: null,
          contact_name: null,
          summary:
            account.ghl_provisioning_error ??
            "Vector 48 setup failed. Retry provisioning to continue.",
          detail: {
            kind: "ghl_provisioning_failed",
            retry_account_id: account.id,
            dismissible: false,
          },
          created_at: new Date().toISOString(),
        } satisfies AutomationEvent)
      : null;
  const bannerAlerts = provisioningAlert
    ? [provisioningAlert, ...unresolvedAlerts]
    : unresolvedAlerts;
  const accountCreatedAtMs = new Date(account.created_at).getTime();
  const showWarmupEmptyState =
    Number.isFinite(accountCreatedAtMs) &&
    Date.now() - accountCreatedAtMs < WARMUP_WINDOW_MS;

  const greeting = getGreeting();
  const headline = account.business_name ? `${greeting}, ${account.business_name}` : greeting;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-[28px] font-bold">{headline}</h1>
        <SignOutButton />
      </div>

      <ProvisioningBanner
        initialStatus={account.ghl_provisioning_status}
        accountId={account.id}
      />
      <AlertBanner initialAlerts={bannerAlerts} />
      <GHLSummary />

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-[var(--v48-border)] bg-white p-5"
          >
            <p className="text-[13px] text-[var(--text-secondary)]">{card.label}</p>
            <p className="mt-1 font-heading text-[32px] font-bold">{card.value}</p>
            <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Last 30 days</p>
          </div>
        ))}
      </div>
      {allStatsZero ? (
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Activate a recipe to start seeing results
        </p>
      ) : null}

      <ActiveRecipesStrip recipes={activeRecipes ?? []} />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-[#0F1923]">
              Activity Feed
            </h2>
            <p className="mt-1 text-sm text-[#64748B]">
              Live updates from your automation events.
            </p>
          </div>
          <ActivityFeed
            initialItems={initialItems}
            initialNextCursor={initialNextCursor}
            accountId={account.id}
            showWarmupEmptyState={showWarmupEmptyState}
          />
        </div>
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
            <h2 className="font-heading text-xl font-semibold text-[#0F1923]">
              Quick Actions
            </h2>
            <div className="mt-3">
              <QuickActions />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
