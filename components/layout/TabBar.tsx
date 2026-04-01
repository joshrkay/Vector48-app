"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Zap,
  Settings,
  User,
  Users,
  MessageSquare,
  Kanban,
  CalendarDays,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

const defaultTabs = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Recipes", href: "/recipes", icon: Zap },
  { label: "CRM", href: "/crm/contacts", icon: Users },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Account", href: "/billing", icon: User },
] as const;

const crmTabs = [
  { label: "Contacts", href: "/crm/contacts", icon: Users },
  { label: "Inbox", href: "/crm/inbox", icon: MessageSquare },
  { label: "Pipeline", href: "/crm/pipeline", icon: Kanban },
  { label: "Calendar", href: "/crm/calendar", icon: CalendarDays },
  { label: "Reports", href: "/crm/reports", icon: BarChart3 },
] as const;

export function TabBar() {
  const pathname = usePathname();
  const isCrmRoute = pathname.startsWith("/crm");
  const tabs = isCrmRoute ? crmTabs : defaultTabs;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-[var(--brand)] md:hidden">
      <div className="flex items-center justify-around py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");

          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-xs",
                isActive ? "text-[var(--v48-accent)]" : "text-white/50"
              )}
            >
              <Icon size={22} strokeWidth={1.5} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
