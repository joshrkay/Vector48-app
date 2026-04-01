"use client";

import Link from "next/link";
import { formatRelativeTime } from "@/lib/dashboard/formatRelativeTime";
import { cn } from "@/lib/utils";
import type { InboxFilterTab } from "@/lib/crm/inboxFilters";
import type { InboxContactPreview } from "@/lib/crm/loadEnrichedInboxConversations";
import type { GHLConversation } from "@/lib/ghl/types";

function previewText(body: string | null, max = 40): string {
  if (!body) return "—";
  const t = body.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

interface Props {
  conversations: GHLConversation[];
  contacts: Record<string, InboxContactPreview>;
  activeConversationId: string | null;
  filter: InboxFilterTab;
}

export function ConversationList({ conversations, contacts, activeConversationId, filter }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-[var(--text-secondary)]">
            No conversations match this filter.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--v48-border)]">
            {conversations.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                contact={contacts[c.contactId] ?? { name: "Unknown", phone: "" }}
                active={c.id === activeConversationId}
                filter={filter}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ConversationRow({
  conversation: c,
  contact,
  active,
  filter,
}: {
  conversation: GHLConversation;
  contact: InboxContactPreview;
  active: boolean;
  filter: InboxFilterTab;
}) {
  const q = new URLSearchParams();
  if (filter !== "all") q.set("filter", filter);
  q.set("conversation", c.id);
  const href = `/crm/inbox?${q.toString()}`;

  return (
    <li>
      <Link
        href={href}
        className={cn(
          "flex gap-2 px-3 py-3 text-left transition-colors hover:bg-slate-50",
          active && "bg-[var(--v48-accent)]/10",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-[var(--text-primary)]">{contact.name}</span>
            {c.unreadCount > 0 ? (
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-[var(--v48-accent)]"
                title="Unread"
                aria-hidden
              />
            ) : null}
          </div>
          <p className="truncate text-xs text-[var(--text-secondary)]">{contact.phone || "—"}</p>
          <p className="truncate text-xs text-[var(--text-primary)]">{previewText(c.lastMessageBody)}</p>
        </div>
        <time
          className="shrink-0 text-[10px] text-[var(--text-secondary)]"
          dateTime={c.lastMessageDate ?? undefined}
        >
          {c.lastMessageDate ? formatRelativeTime(c.lastMessageDate) : "—"}
        </time>
      </Link>
    </li>
  );
}
