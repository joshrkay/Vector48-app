import { redirect } from "next/navigation";
import { getSessionData } from "@/lib/data/session";

const stats = [
  { label: "Calls Handled", value: "0" },
  { label: "Leads Contacted", value: "0" },
  { label: "Reviews Sent", value: "0" },
  { label: "Bookings Confirmed", value: "0" },
];

function getGreeting(): string {
  const hour = new Date().getUTCHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const { user, account } = await getSessionData();

  if (!user || !account) {
    redirect("/login");
  }

  return (
    <div>
      <h1 className="font-heading font-bold text-[28px]">
        {getGreeting()}, {account.business_name}
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
              This week
            </p>
          </div>
        ))}
      </div>

      {/* Activity feed placeholder */}
      <div className="bg-gray-50 rounded-2xl p-8 mt-6 flex items-center justify-center min-h-[200px]">
        <p className="text-[var(--text-secondary)] text-sm">
          No activity yet. Activate a recipe to get started.
        </p>
      </div>
    </div>
  );
}
