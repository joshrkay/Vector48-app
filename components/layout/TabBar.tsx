"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Zap,
  Users,
  Settings,
  User,
  MessageSquare,
  Kanban,
  CalendarDays,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const crmSubNav = [
  { label: "Contacts", href: "/crm/contacts", icon: Users },
  { label: "Inbox", href: "/crm/inbox", icon: MessageSquare },
  { label: "Pipeline", href: "/crm/pipeline", icon: Kanban },
  { label: "Calendar", href: "/crm/calendar", icon: CalendarDays },
];

const tabs = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "Recipes", href: "/recipes", icon: Zap },
  { label: "CRM", href: "#crm", icon: Users },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Account", href: "/billing", icon: User },
] as const;

export function TabBar() {
  const pathname = usePathname();
  const [crmOpen, setCrmOpen] = useState(false);

  const isCrmActive = pathname.startsWith("/crm");

  return (
    <>
      {/* CRM sub-nav sheet */}
      {crmOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setCrmOpen(false)}
          />
          <div className="absolute bottom-16 left-0 right-0 rounded-t-2xl bg-surface p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-heading text-sm font-semibold text-text-primary">
                CRM
              </h3>
              <button
                onClick={() => setCrmOpen(false)}
                className="rounded-full p-1 hover:bg-bg"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {crmSubNav.map((item) => {
                const Icon = item.icon;
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setCrmOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-3 text-sm font-medium",
                      isActive
                        ? "bg-accent-light text-accent"
                        : "text-text-secondary hover:bg-bg"
                    )}
                  >
                    <Icon size={18} strokeWidth={1.5} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-surface lg:hidden">
        <div className="flex items-center justify-around py-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isCrmTab = tab.href === "#crm";
            const isActive = isCrmTab
              ? isCrmActive
              : pathname === tab.href || pathname.startsWith(tab.href + "/");

            if (isCrmTab) {
              return (
                <button
                  key={tab.label}
                  onClick={() => setCrmOpen(!crmOpen)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 text-xs",
                    isActive ? "text-accent" : "text-text-secondary"
                  )}
                >
                  <Icon size={22} strokeWidth={1.5} />
                  {tab.label}
                </button>
              );
            }

            return (
              <Link
                key={tab.label}
                href={tab.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 text-xs",
                  isActive ? "text-accent" : "text-text-secondary"
                )}
              >
                <Icon size={22} strokeWidth={1.5} />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
