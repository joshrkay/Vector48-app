"use client";

import Link from "next/link";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  type InboxFilterTab,
  filterConversationsForInbox,
} from "@/lib/crm/inboxFilters";
import type { GHLConversation } from "@/lib/ghl/types";

const TABS: { id: InboxFilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "ai_handled", label: "AI Handled" },
  { id: "needs_reply", label: "Needs Reply" },
];

function buildHref(nextFilter: InboxFilterTab, conversationId: string | null, conversations: GHLConversation[]) {
  const now = Date.now();
  const underFilter = filterConversationsForInbox(conversations, nextFilter, now);
  const ids = new Set(underFilter.map((c) => c.id));
  const keepConv = conversationId && ids.has(conversationId) ? conversationId : null;

  const q = new URLSearchParams();
  if (nextFilter !== "all") q.set("filter", nextFilter);
  if (keepConv) q.set("conversation", keepConv);
  const s = q.toString();
  return s ? `/crm/inbox?${s}` : "/crm/inbox";
}

interface Props {
  active: InboxFilterTab;
  conversationId: string | null;
  conversations: GHLConversation[];
}

export function InboxFilterTabs({ active, conversationId, conversations }: Props) {
  const hrefs = useMemo(
    () =>
      TABS.reduce(
        (acc, tab) => {
          acc[tab.id] = buildHref(tab.id, conversationId, conversations);
          return acc;
        },
        {} as Record<InboxFilterTab, string>,
      ),
    [conversationId, conversations],
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
