import { createServerClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";

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

export default async function DashboardPage() {
  let businessName = "";

  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: account } = await supabase
        .from("accounts")
        .select("business_name")
        .single();

      if (account) {
        businessName = account.business_name;
      }
    }
  } catch {
    // Fail gracefully
  }

  const greeting = getGreeting();
  const headline = businessName
    ? `${greeting}, ${businessName}`
    : greeting;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-heading font-bold text-[28px]">{headline}</h1>
        <SignOutButton />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white border border-[var(--v48-border)] rounded-2xl p-5"
          >
            <p className="text-[13px] text-[var(--text-secondary)]">
              {stat.label}
            </p>
            <p className="font-heading font-bold text-[32px] mt-1">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Activity placeholder */}
      <div className="bg-gray-50 rounded-2xl p-8 mt-6 flex items-center justify-center min-h-[200px]">
        <p className="text-[var(--text-secondary)] text-sm">
          No activity yet. Activate a recipe to get started.
        </p>
      </div>
    </div>
  );
}
