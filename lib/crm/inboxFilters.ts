import type { GHLConversation } from "@/lib/ghl/types";

export type InboxFilterTab = "all" | "unread" | "ai_handled" | "needs_reply";

export function parseInboxFilterTab(raw: string | undefined): InboxFilterTab {
  if (raw === "unread" || raw === "ai_handled" || raw === "needs_reply") {
    return raw;
  }
  return "all";
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function parseLastMessageTime(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/** PRD: unread + no outbound message in last 2 hours (inferred from last message on thread). */
export function conversationNeedsReply(
  unreadCount: number,
  lastMessageDirection: "inbound" | "outbound" | null | undefined,
  lastMessageDate: string | null,
  nowMs: number,
): boolean {
  if (unreadCount <= 0) return false;
  const t = parseLastMessageTime(lastMessageDate);
  if (lastMessageDirection === "outbound" && t !== null && nowMs - t < TWO_HOURS_MS) {
    return false;
  }
  return true;
}

/** Heuristic until GHL exposes a stable "last sender = AI" flag on the conversation list. */
export function isConversationAiHandledLast(c: GHLConversation): boolean {
  const src = (c.lastMessageSource ?? "").toLowerCase();
  if (
    src.includes("workflow") ||
    src.includes("automation") ||
    src.includes("bot") ||
    src.includes("system")
  ) {
    return true;
  }
  return false;
}

export function conversationMatchesInboxFilter(
  c: GHLConversation,
  filter: InboxFilterTab,
  nowMs: number,
): boolean {
  if (filter === "all") return true;
  if (filter === "unread") return c.unreadCount > 0;
  if (filter === "ai_handled") return isConversationAiHandledLast(c);
  if (filter === "needs_reply") {
    return conversationNeedsReply(c.unreadCount, c.lastMessageDirection, c.lastMessageDate, nowMs);
  }
  return true;
}

export function filterConversationsForInbox(
  conversations: GHLConversation[],
  filter: InboxFilterTab,
  nowMs: number,
): GHLConversation[] {
  return conversations.filter((c) => conversationMatchesInboxFilter(c, filter, nowMs));
}

export function buildInboxFilterHref(
  nextFilter: InboxFilterTab,
  conversationId: string | null,
  conversations: GHLConversation[],
  nowMs: number,
): string {
  const underFilter = filterConversationsForInbox(conversations, nextFilter, nowMs);
  const ids = new Set(underFilter.map((c) => c.id));
  const keepConversation = conversationId && ids.has(conversationId) ? conversationId : null;

  const query = new URLSearchParams();
  if (nextFilter !== "all") {
    query.set("filter", nextFilter);
  }
  if (keepConversation) {
    query.set("conversation", keepConversation);
  }

  const search = query.toString();
  return search ? `/crm/inbox?${search}` : "/crm/inbox";
}
