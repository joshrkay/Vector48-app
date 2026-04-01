"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "@/lib/swr";
import { Button } from "@/components/ui/button";
import { AIContextBanner } from "@/components/crm/inbox/AIContextBanner";
import { ConversationList } from "@/components/crm/inbox/ConversationList";
import { InboxFilterTabs } from "@/components/crm/inbox/InboxFilterTabs";
import { MessageThread } from "@/components/crm/inbox/MessageThread";
import { ReplyInput } from "@/components/crm/inbox/ReplyInput";
import { filterConversationsForInbox, parseInboxFilterTab, type InboxFilterTab } from "@/lib/crm/inboxFilters";
import type { EnrichedInboxConversations } from "@/lib/crm/loadEnrichedInboxConversations";
import type { GHLMessage } from "@/lib/ghl/types";

async function fetchInboxList([url]: readonly unknown[]): Promise<EnrichedInboxConversations> {
  const path = typeof url === "string" ? url : "/api/ghl/conversations";
  const res = await fetch(path);
  const body = (await res.json()) as EnrichedInboxConversations & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to load inbox");
  }
  return { conversations: body.conversations ?? [], contacts: body.contacts ?? {} };
}

function backToListHref(filter: InboxFilterTab): string {
  if (filter === "all") return "/crm/inbox";
  return `/crm/inbox?filter=${filter}`;
}

interface Props {
  initial: EnrichedInboxConversations;
  initialConversationId: string | null;
  initialFilter: string | null;
}

export function InboxClientShell({ initial, initialConversationId, initialFilter }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("conversation") ?? initialConversationId;
  const filter = parseInboxFilterTab(searchParams.get("filter") ?? initialFilter ?? undefined);

  const { data } = useSWR<EnrichedInboxConversations>(["/api/ghl/conversations"], fetchInboxList, {
    dedupingInterval: 25_000,
    refreshIntervalMs: 30_000,
    keepPreviousData: true,
    revalidateOnFocus: true,
  });

  const enriched = data ?? initial;
  const { conversations, contacts } = enriched;

  const filtered = useMemo(
    () => filterConversationsForInbox(conversations, filter, Date.now()),
    [conversations, filter],
  );

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === conversationId) ?? null,
    [conversations, conversationId],
  );

  const [orphanConversation, setOrphanConversation] = useState<{
    contactId: string;
    locationId: string;
  } | null>(null);

  useEffect(() => {
    if (!conversationId || activeConversation) {
      setOrphanConversation(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/ghl/conversations/${encodeURIComponent(conversationId)}`);
        const body = (await res.json()) as {
          conversation?: { contactId: string; locationId: string };
          error?: string;
        };
        if (!res.ok || cancelled) return;
        const c = body.conversation;
        if (c?.contactId && c.locationId) {
          setOrphanConversation({ contactId: c.contactId, locationId: c.locationId });
        }
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, activeConversation]);

  const [draftMessage, setDraftMessage] = useState<GHLMessage | null>(null);
  const [threadBump, setThreadBump] = useState(0);
  const [recipeBannerActive, setRecipeBannerActive] = useState(false);

  const onRecipeContext = useCallback((active: boolean) => {
    setRecipeBannerActive(active);
  }, []);

  const resolvedContactId = activeConversation?.contactId ?? orphanConversation?.contactId ?? null;
  const locationId = activeConversation?.locationId ?? orphanConversation?.locationId ?? "";

  useEffect(() => {
    setRecipeBannerActive(false);
    setDraftMessage(null);
  }, [conversationId]);

  return (
    <div className="flex min-h-[calc(100vh-10rem)] flex-col gap-3">
      <div>
        <h1 className="font-heading text-2xl font-bold text-[var(--text-primary)]">Inbox</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          SMS, email, and calls in one place — synced from GoHighLevel.
        </p>
      </div>

      <InboxFilterTabs active={filter} conversationId={conversationId} conversations={conversations} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--v48-border)] bg-white md:h-[min(720px,calc(100vh-12rem))] md:flex-row">
        <aside
          className={
            conversationId
              ? "hidden min-h-0 w-full shrink-0 border-[var(--v48-border)] md:flex md:w-80 md:flex-col md:border-r"
              : "flex min-h-[240px] w-full shrink-0 flex-col border-[var(--v48-border)] md:w-80 md:border-r"
          }
        >
          <ConversationList
            conversations={filtered}
            contacts={contacts}
            activeConversationId={conversationId}
            filter={filter}
          />
        </aside>

        <section
          className={
            conversationId
              ? "fixed inset-0 z-40 flex min-h-0 flex-1 flex-col bg-[var(--bg)] pb-20 md:static md:inset-auto md:z-auto md:bg-white md:pb-0"
              : "hidden min-h-0 flex-1 flex-col md:flex"
          }
        >
          <div className="flex min-h-0 flex-1 flex-col bg-white md:rounded-none">
            <div className="flex items-center gap-2 border-b border-[var(--v48-border)] px-2 py-2 md:hidden">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => router.push(backToListHref(filter))}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </div>

            <AIContextBanner active={recipeBannerActive} />

            <MessageThread
              conversationId={conversationId}
              contactId={resolvedContactId}
              draftMessage={draftMessage}
              threadBump={threadBump}
              onRecipeContext={onRecipeContext}
            />

            <div className="sticky bottom-0 mt-auto bg-white pb-4 md:pb-2">
              <ReplyInput
                conversationId={conversationId}
                contactId={resolvedContactId}
                locationId={locationId}
                recipeActive={recipeBannerActive}
                onDraft={setDraftMessage}
                onSent={() => setThreadBump((b) => b + 1)}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
