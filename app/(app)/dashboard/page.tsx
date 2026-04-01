import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { RecipeFilter } from "@/components/dashboard/RecipeFilter";
import { createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type DashboardStatCard = {
  label: string;
  value: string;
  periodLabel: string;
};

type AutomationEvent = Database["public"]["Tables"]["automation_events"]["Row"];

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { recipe?: string };
}) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name, created_at")
    .eq("owner_user_id", user.id)
    .single();

  if (!account) redirect("/login");

  const recipe = searchParams?.recipe;

  let query = supabase
    .from("automation_events")
    .select(
      "id, account_id, recipe_slug, event_type, ghl_event_type, ghl_event_id, contact_id, contact_phone, contact_name, summary, detail, created_at",
    )
    .eq("account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(21);

  if (recipe) query = query.eq("recipe_slug", recipe);

  const { data: eventRows } = await query;

  const initialRows = (eventRows ?? []) as AutomationEvent[];
  const initialItems = initialRows.slice(0, 20);
  const initialNextCursor =
    initialRows.length > 20 ? initialItems[initialItems.length - 1]?.created_at ?? null : null;

  const { data: activations } = await supabase
    .from("recipe_activations")
    .select("recipe_slug")
    .eq("account_id", account.id)
    .eq("status", "active")
    .order("recipe_slug", { ascending: true });

  const recipes = Array.from(new Set((activations ?? []).map((row) => row.recipe_slug)));
  const statCards = await getStatCards(account.id);

  const greeting = getGreeting();
  const headline = account.business_name ? `${greeting}, ${account.business_name}` : greeting;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-[28px] font-bold">{headline}</h1>
        <SignOutButton />
      </div>

      <section className="mt-6 rounded-2xl border border-[var(--v48-border)] bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Alerts will appear here when recipes require attention.
      </section>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
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

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <RecipeFilter accountId={account.id} initialRecipes={recipes} />
          <ActivityFeed
            initialItems={initialItems}
            initialNextCursor={initialNextCursor}
            accountId={account.id}
            accountCreatedAt={account.created_at}
          />
        </div>
        <div className="lg:col-span-2" />
      </div>
    </div>
  );
}
