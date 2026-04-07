"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getContactFromCache } from "@/lib/crm/contactCache";

const segmentLabelMap: Record<string, string> = {
  crm: "CRM",
  contacts: "Contacts",
  inbox: "Inbox",
  pipeline: "Pipeline",
  calendar: "Calendar",
  reports: "Reports",
};

export function CRMBreadcrumb() {
  const pathname = usePathname();
  const params = useParams<{ id?: string }>();

  const rawSegments = pathname.split("/").filter(Boolean);
  const segments = rawSegments.filter((segment) => segment !== "app");

  const crumbs = segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`;

    if (segment === "crm") {
      return { label: "CRM", href: "/crm/contacts" };
    }

    if (segment === params.id && params.id) {
      const cached = getContactFromCache(params.id);
      return {
        label: cached?.name ?? "Contact",
        href,
      };
    }

    return {
      label: segmentLabelMap[segment] ?? segment,
      href,
    };
  });

  return (
    <nav aria-label="CRM breadcrumb" className="flex items-center gap-1 text-sm text-[var(--text-secondary)]">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;

        return (
          <div key={crumb.href} className="flex items-center gap-1">
            {index > 0 ? <ChevronRight size={14} className="text-gray-400" /> : null}
            <Link
              href={crumb.href}
              className={cn(
                "hover:text-[var(--v48-accent)]",
                isLast && "font-medium text-[var(--text-primary)] pointer-events-none"
              )}
            >
              {crumb.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
