"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  buildInboxFilterHref,
  type InboxFilterTab,
} from "@/lib/crm/inboxFilters";
import type { GHLConversation } from "@/lib/ghl/types";

const TABS: { id: InboxFilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "ai_handled", label: "AI Handled" },
  { id: "needs_reply", label: "Needs Reply" },
];

interface Props {
  active: InboxFilterTab;
  conversationId: string | null;
  conversations: GHLConversation[];
}

const HREF_TIME_REFRESH_MS = 60_000;

export function InboxFilterTabs({ active, conversationId, conversations }: Props) {
  const [, setHrefTimeTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setHrefTimeTick((t) => t + 1);
    }, HREF_TIME_REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  const hrefs = TABS.reduce(
    (acc, tab) => {
      acc[tab.id] = buildInboxFilterHref(tab.id, conversationId, conversations, Date.now());
      return acc;
    },
    {} as Record<InboxFilterTab, string>,
  );

  return (
    <div className="flex flex-wrap gap-1 border-b border-[var(--v48-border)] pb-2">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={hrefs[tab.id]}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            active === tab.id
              ? "bg-[var(--v48-accent)] text-white"
              : "bg-white/80 text-[var(--text-secondary)] hover:bg-slate-100",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
