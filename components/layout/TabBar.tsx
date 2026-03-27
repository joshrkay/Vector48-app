"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Zap,
  Grid3X3 as Grid,
  Settings,
  User,
  Users,
  MessageSquare,
  Kanban,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const crmSubNav = [
  { label: "Contacts", href: "/crm/contacts", icon: Users },
  { label: "Inbox", href: "/crm/inbox", icon: MessageSquare },
  { label: "Pipeline", href: "/crm/pipeline", icon: Kanban },
  { label: "Calendar", href: "/crm/calendar", icon: CalendarDays },
];

const tabs = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Recipes", href: "/recipes", icon: Zap },
  { label: "CRM", href: "#crm", icon: Grid },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Account", href: "/billing", icon: User },
] as const;

export function TabBar() {
  const pathname = usePathname();
  const isCrmActive = pathname.startsWith("/crm");

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-[var(--brand)] md:hidden">
      <div className="flex items-center justify-around py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isCrmTab = tab.href === "#crm";
          const isActive = isCrmTab
            ? isCrmActive
            : pathname === tab.href || pathname.startsWith(tab.href + "/");

          if (isCrmTab) {
            return (
              <Sheet key={tab.label}>
                <SheetTrigger asChild>
                  <button
                    className={cn(
                      "flex flex-col items-center gap-1 py-2 text-xs",
                      isActive ? "text-[var(--v48-accent)]" : "text-white/50"
                    )}
                  >
                    <Icon size={22} strokeWidth={1.5} />
                    {tab.label}
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="rounded-t-2xl bg-white">
                  <SheetHeader>
                    <SheetTitle className="font-heading text-sm font-semibold">
                      CRM
                    </SheetTitle>
                  </SheetHeader>
                  <div className="grid grid-cols-2 gap-2 pt-4">
                    {crmSubNav.map((item) => {
                      const SubIcon = item.icon;
                      const isSubActive = pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-2 rounded-lg px-3 py-3 text-sm font-medium",
                            isSubActive
                              ? "bg-[var(--v48-accent-light)] text-[var(--v48-accent)]"
                              : "text-[var(--text-secondary)] hover:bg-gray-100"
                          )}
                        >
                          <SubIcon size={18} strokeWidth={1.5} />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </SheetContent>
              </Sheet>
            );
          }

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
