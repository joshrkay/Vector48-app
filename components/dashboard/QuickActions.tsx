"use client";

import { useRouter } from "next/navigation";
import { CalendarPlus, Kanban, UserPlus, Zap } from "lucide-react";

const actions = [
  {
    label: "Add Contact",
    description: "Create a new CRM contact",
    href: "/crm/contacts?action=add",
    icon: UserPlus,
  },
  {
    label: "Schedule Appointment",
    description: "Book a calendar slot",
    href: "/crm/calendar?action=add",
    icon: CalendarPlus,
  },
  {
    label: "View Pipeline",
    description: "See open opportunities",
    href: "/crm/pipeline",
    icon: Kanban,
  },
  {
    label: "Activate Recipe",
    description: "Launch an automation",
    href: "/recipes",
    icon: Zap,
  },
] as const;

export function QuickActions() {
  const router = useRouter();

  return (
    <div className="grid grid-cols-2 gap-3">
      {actions.map((action) => (
        <button
          key={action.href}
          type="button"
          onClick={() => router.push(action.href)}
          className="flex flex-col items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white p-4 text-center transition-colors hover:border-[var(--v48-accent)] hover:bg-[var(--v48-accent-light)]"
        >
          <action.icon className="h-6 w-6 text-[var(--v48-accent)]" />
          <div>
            <p className="text-sm font-medium text-[#0F1923]">{action.label}</p>
            <p className="mt-0.5 text-xs text-[#64748B]">{action.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
