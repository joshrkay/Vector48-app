import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

const stats = [
  { label: "Calls Handled", value: "24", sub: "This week" },
  { label: "Leads Contacted", value: "12", sub: "This week" },
  { label: "Reviews Sent", value: "8", sub: "This week" },
  { label: "Bookings Confirmed", value: "6", sub: "This week" },
];

function getGreeting(): string {
  const hour = new Date().getUTCHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("business_name")
    .eq("owner_user_id", user.id)
    .single();

  const businessName = account?.business_name || "your business";

  return (
    <div>
      <h1 className="font-heading font-bold text-[28px]">
        {getGreeting()}, {businessName}
      </h1>

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
            <p className="text-[12px] text-[var(--text-secondary)] mt-1">
              {stat.sub}
            </p>
          </div>
        ))}
      </div>

      {/* Activity feed placeholder */}
      <div className="bg-gray-50 rounded-2xl p-8 mt-6 flex items-center justify-center min-h-[200px]">
        <p className="text-[var(--text-secondary)] text-sm">
          Activity feed coming soon
        </p>
      </div>
    </div>
  );
}
