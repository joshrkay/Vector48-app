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
  // Exact match first
  if (pageTitles[pathname]) return pageTitles[pathname];
  // Check prefix matches (e.g., /crm/contacts/[id])
  const match = Object.entries(pageTitles).find(([path]) =>
    pathname.startsWith(path + "/")
  );
  return match ? match[1] : "Vector 48";
}

export function TopBar() {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--v48-border)] px-6">
      <h1 className="font-heading text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-4">
        <button className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
          <Bell size={20} strokeWidth={1.5} />
        </button>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-[var(--v48-accent)] text-white text-xs font-medium">
            JK
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
