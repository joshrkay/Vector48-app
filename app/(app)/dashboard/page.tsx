import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { RecipeFilter } from "@/components/dashboard/RecipeFilter";
import { createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

const stats = [
  { label: "Calls Handled", value: "0" },
  { label: "Leads Contacted", value: "0" },
  { label: "Reviews Sent", value: "0" },
  { label: "Bookings Confirmed", value: "0" },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

type AutomationEvent = Database["public"]["Tables"]["automation_events"]["Row"];

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

  const greeting = getGreeting();
  const headline = account.business_name ? `${greeting}, ${account.business_name}` : greeting;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-[28px] font-bold">{headline}</h1>
        <SignOutButton />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-[var(--v48-border)] bg-white p-5"
          >
            <p className="text-[13px] text-[var(--text-secondary)]">{stat.label}</p>
            <p className="mt-1 font-heading text-[32px] font-bold">{stat.value}</p>
            <p className="mt-1 text-[12px] text-[var(--text-secondary)]">This week</p>
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
