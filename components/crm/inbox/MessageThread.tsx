"use client";

import { useEffect, useMemo, useRef } from "react";
import useSWR from "@/lib/swr";
import { formatRelativeTime } from "@/lib/dashboard/formatRelativeTime";
import { isMessageLikelyFromAiOrSystem } from "@/lib/crm/ghlMessageAi";
import { cn } from "@/lib/utils";
import type { GHLMessage } from "@/lib/ghl/types";
import { Badge } from "@/components/ui/badge";

interface ThreadBundle {
  messages: GHLMessage[];
  recipeActive: boolean;
}

async function fetchThreadBundle(key: readonly unknown[]): Promise<ThreadBundle> {
  const convId = key[1];
  const contactId = key[2];
  if (typeof convId !== "string" || typeof contactId !== "string") {
    return { messages: [], recipeActive: false };
  }

  const [msgRes, actRes] = await Promise.all([
    fetch(`/api/ghl/conversations/${encodeURIComponent(convId)}/messages?limit=100`),
    fetch(`/api/recipes/active-for-contact?contactId=${encodeURIComponent(contactId)}`),
  ]);

  const msgJson = (await msgRes.json()) as { messages?: GHLMessage[]; error?: string };
  const actJson = (await actRes.json()) as { active?: boolean; error?: string };

  if (!msgRes.ok) {
    throw new Error(msgJson.error ?? "Failed to load messages");
  }
  if (!actRes.ok) {
    throw new Error(actJson.error ?? "Failed to load recipe context");
  }

  return {
    messages: msgJson.messages ?? [],
    recipeActive: Boolean(actJson.active),
  };
}

function sortMessagesAsc(messages: GHLMessage[]): GHLMessage[] {
  return [...messages].sort(
    (a, b) => new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime(),
  );
}

interface Props {
  conversationId: string | null;
  contactId: string | null;
  draftMessage: GHLMessage | null;
  onRecipeContext: (active: boolean) => void;
}

export function MessageThread({ conversationId, contactId, draftMessage, onRecipeContext }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const swrKey =
    conversationId && contactId ? (["inbox-thread", conversationId, contactId] as const) : null;

  const { data, error, isLoading } = useSWR<ThreadBundle>(swrKey, fetchThreadBundle, {
    dedupingInterval: 8_000,
    refreshIntervalMs: 10_000,
    keepPreviousData: true,
    revalidateOnFocus: true,
  });

  useEffect(() => {
    onRecipeContext(data?.recipeActive ?? false);
  }, [data?.recipeActive, onRecipeContext]);

  const merged = useMemo(() => {
    const base = sortMessagesAsc(data?.messages ?? []);
    if (!draftMessage) return base;
    const has = base.some((m) => m.id === draftMessage.id);
    return has ? base : [...base, draftMessage];
  }, [data?.messages, draftMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [merged.length, conversationId]);

  if (!conversationId || !contactId) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-[var(--text-secondary)]">
        Select a conversation to view messages.
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-red-600">
        {error.message}
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-[var(--text-secondary)]">
        Loading messages…
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      {merged.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--text-secondary)]">No messages yet.</p>
      ) : (
        <div className="space-y-3">
          {merged.map((msg) => {
            const isOutbound = msg.direction === "outbound";
            const pending = msg.id.startsWith("opt-");
            const ai = isMessageLikelyFromAiOrSystem(msg);
            const fullTs = new Date(msg.dateAdded).toLocaleString();

            return (
              <div
                key={msg.id}
                className={cn("flex", isOutbound ? "justify-end" : "justify-start")}
              >
                <div
                  title={fullTs}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm md:max-w-[72%]",
                    isOutbound
                      ? "rounded-br-sm bg-teal-600 text-white"
                      : "rounded-bl-sm bg-slate-100 text-slate-800",
                    pending && "opacity-70",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ai ? (
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px] font-semibold uppercase",
                          isOutbound ? "border-teal-200/40 bg-teal-700 text-white" : "",
                        )}
                      >
                        AI
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words">{msg.body}</p>
                  <p
                    className={cn(
                      "mt-1 text-[10px] opacity-0 transition-opacity group-hover:opacity-100",
                      isOutbound ? "text-teal-100" : "text-slate-400",
                    )}
                  />
                  <p className={cn("mt-1 text-[10px]", isOutbound ? "text-teal-100" : "text-slate-400")}>
                    <span className="sr-only">Sent </span>
                    {pending ? "Sending…" : formatRelativeTime(msg.dateAdded)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
