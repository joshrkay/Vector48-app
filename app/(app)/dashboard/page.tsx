import { Button } from "@/components/ui/button";

const stats = [
  { label: "Calls Handled", value: "24", sub: "This week" },
  { label: "Leads Contacted", value: "12", sub: "This week" },
  { label: "Reviews Sent", value: "8", sub: "This week" },
  { label: "Bookings Confirmed", value: "6", sub: "This week" },
];

export default function DashboardPage() {
  return (
    <div>
      <h1 className="font-heading font-bold text-[28px]">Dashboard</h1>

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

      {/* shadcn Button smoke test */}
      <div className="mt-6 flex gap-3">
        <Button>Primary Button</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
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
