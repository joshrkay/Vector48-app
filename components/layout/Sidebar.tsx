"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Zap,
  ClipboardList,
  Users,
  MessageSquare,
  Kanban,
  CalendarDays,
  Settings,
  CreditCard,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const mainNavItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Recipes", href: "/recipes", icon: Zap },
];

const toolsNavItems: NavItem[] = [
  {
    label: "Estimate Audit",
    href: "/recipes/estimate-audit",
    icon: ClipboardList,
  },
];

const devNavItems: NavItem[] = [
  { label: "n8n test", href: "/dev/n8n-test", icon: Workflow },
];

const crmNavItems: NavItem[] = [
  { label: "Contacts", href: "/crm/contacts", icon: Users },
  { label: "Inbox", href: "/crm/inbox", icon: MessageSquare },
  { label: "Pipeline", href: "/crm/pipeline", icon: Kanban },
  { label: "Calendar", href: "/crm/calendar", icon: CalendarDays },
];

const bottomNavItems: NavItem[] = [
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Billing", href: "/billing", icon: CreditCard },
];

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive =
    pathname === item.href || pathname.startsWith(item.href + "/");
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-4 py-2.5 mx-2 text-sm transition-colors",
        isActive
          ? "border-l-2 border-[var(--v48-accent)] bg-[var(--v48-accent)]/15 text-[var(--v48-accent)] font-medium"
          : "text-white/70 hover:bg-white/5 hover:text-white"
      )}
    >
      <Icon size={18} strokeWidth={1.5} />
      {item.label}
    </Link>
  );
}

interface SidebarProps {
  planSlug: string;
  trialEndsAt: string | null;
}

const showN8nDevNav =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_ENABLE_N8N_DEV_TOOLS === "true";

export function Sidebar({ planSlug, trialEndsAt }: SidebarProps) {
  const pathname = usePathname();

  const isTrial = planSlug === "trial";
  let daysLeft = 0;
  if (isTrial && trialEndsAt) {
    daysLeft = Math.max(
      0,
      Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000)
    );
  }

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col fixed left-0 top-0 h-screen bg-[var(--brand)] text-white z-40">
      {/* Wordmark */}
      <div className="flex h-16 items-center px-6">
        <span className="font-heading text-lg font-bold tracking-tight">
          Vector 48
        </span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 flex flex-col py-2">
        <div className="space-y-1">
          {mainNavItems.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>

        <div className="mt-4">
          <p className="mx-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
            Tools
          </p>
          <div className="space-y-1">
            {toolsNavItems.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        </div>

        {showN8nDevNav && (
          <div className="mt-4">
            <p className="mx-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
              Dev
            </p>
            <div className="space-y-1">
              {devNavItems.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          </div>
        )}

        {/* CRM section */}
        <div className="mt-4">
          <p className="mx-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
            CRM
          </p>
          <div className="space-y-1">
            {crmNavItems.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        </div>

        {/* Spacer to push bottom items down */}
        <div className="flex-1" />

        {/* Trial badge */}
        {isTrial && (
          <div className="mx-4 mb-3">
            <div
              className={cn(
                "rounded-full px-3 py-1.5 text-center text-[12px]",
                daysLeft <= 3
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-white/10 text-white/70"
              )}
            >
              {daysLeft} days left in trial
            </div>
          </div>
        )}

        {/* Bottom nav */}
        <div className="space-y-1 pb-4">
          {bottomNavItems.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      </nav>
    </aside>
  );
}
