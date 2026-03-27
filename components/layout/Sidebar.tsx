"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Zap,
  Users,
  MessageSquare,
  Kanban,
  CalendarDays,
  Settings,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Recipes", href: "/recipes", icon: Zap },
  { label: "Contacts", href: "/crm/contacts", icon: Users, group: "CRM" },
  { label: "Inbox", href: "/crm/inbox", icon: MessageSquare, group: "CRM" },
  { label: "Pipeline", href: "/crm/pipeline", icon: Kanban, group: "CRM" },
  { label: "Calendar", href: "/crm/calendar", icon: CalendarDays, group: "CRM" },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Billing", href: "/billing", icon: CreditCard },
];

export function Sidebar() {
  const pathname = usePathname();

  let currentGroup: string | undefined;

  return (
    <aside className="hidden lg:flex lg:w-60 lg:flex-col bg-brand text-white h-screen sticky top-0">
      {/* Logo */}
      <div className="flex h-16 items-center px-6">
        <span className="font-heading text-xl font-bold tracking-tight">
          Vector 48
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          // Render group label if this is a new group
          const showGroupLabel =
            item.group && item.group !== currentGroup;
          if (item.group) currentGroup = item.group;

          return (
            <div key={item.href}>
              {showGroupLabel && (
                <p className="mt-6 mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-white/50">
                  {item.group}
                </p>
              )}
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "border-l-2 border-accent bg-accent/10 text-white"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon size={20} strokeWidth={1.5} />
                {item.label}
              </Link>
            </div>
          );
        })}
      </nav>

      {/* Trial badge — placeholder, will be wired to account data */}
      <div className="px-4 pb-6">
        <div className="rounded-lg bg-white/10 px-4 py-3 text-center text-sm">
          <p className="text-white/60">Trial</p>
          <p className="font-semibold text-accent">14 days remaining</p>
        </div>
      </div>
    </aside>
  );
}
