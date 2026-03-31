import { Users, Zap, Phone, MessageSquare, type LucideIcon } from "lucide-react";

interface TileSpec {
  label: string;
  value: string;
  icon: LucideIcon;
}

interface DashboardKpiTilesProps {
  contactTotal: number | null;
  activeRecipes: number;
  callsHandled: number;
  messagesSent: number;
}

function formatValue(n: number | null): string {
  if (n === null) return "--";
  return n.toLocaleString();
}

export function DashboardKpiTiles({
  contactTotal,
  activeRecipes,
  callsHandled,
  messagesSent,
}: DashboardKpiTilesProps) {
  const tiles: TileSpec[] = [
    { label: "Total Contacts", value: formatValue(contactTotal), icon: Users },
    { label: "Active Recipes", value: activeRecipes.toLocaleString(), icon: Zap },
    { label: "Calls Handled", value: callsHandled.toLocaleString(), icon: Phone },
    {
      label: "Messages Sent",
      value: messagesSent.toLocaleString(),
      icon: MessageSquare,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {tiles.map(({ label, value, icon: Icon }) => (
        <div
          key={label}
          className="rounded-xl border border-slate-800 bg-slate-900/50 p-5"
        >
          <Icon
            className="h-6 w-6 text-teal-500"
            strokeWidth={1.5}
            aria-hidden
          />
          <p className="mt-3 font-sans text-[13px] text-slate-400">{label}</p>
          <p className="mt-1 font-heading text-[28px] font-bold text-white">
            {value}
          </p>
          <p className="mt-2 font-sans text-xs text-slate-500">
            vs last 30 days
          </p>
        </div>
      ))}
    </div>
  );
}
