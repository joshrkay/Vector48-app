"use client";

import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/recipes": "Recipes",
  "/crm/contacts": "Contacts",
  "/crm/inbox": "Inbox",
  "/crm/pipeline": "Pipeline",
  "/crm/calendar": "Calendar",
  "/settings": "Settings",
  "/billing": "Billing",
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  const match = Object.entries(pageTitles).find(([path]) =>
    pathname.startsWith(path + "/")
  );
  return match ? match[1] : "Vector 48";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface TopBarProps {
  businessName?: string;
}

export function TopBar({ businessName }: TopBarProps) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const initials = businessName ? getInitials(businessName) : "V8";

  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--v48-border)] px-6">
      <h1 className="font-heading text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-4">
        <button className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
          <Bell size={20} strokeWidth={1.5} />
        </button>
        <Avatar className="h-8 w-8" title={businessName}>
          <AvatarFallback className="bg-[var(--v48-accent)] text-white text-xs font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
