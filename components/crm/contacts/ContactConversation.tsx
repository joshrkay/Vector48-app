"use client";

import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/dashboard/formatRelativeTime";
import type { GHLConversation, GHLMessage, GHLMessageType } from "@/lib/ghl/types";

interface Props {
  conversations: GHLConversation[];
  initialMessages: GHLMessage[];
  contactId: string;
}

function typeLabel(type: GHLMessageType): string {
  const map: Record<string, string> = {
    TYPE_SMS: "SMS",
    TYPE_EMAIL: "Email",
    TYPE_CALL: "Call",
    TYPE_LIVE_CHAT: "Chat",
    TYPE_FACEBOOK: "Facebook",
    TYPE_INSTAGRAM: "Instagram",
    TYPE_WHATSAPP: "WhatsApp",
    TYPE_CUSTOM_SMS: "SMS",
    TYPE_CUSTOM_EMAIL: "Email",
  };
  return map[type] ?? type.replace("TYPE_", "");
}

interface ThreadProps {
  conversation: GHLConversation;
  messages: GHLMessage[];
  contactId: string;
}

function Thread({ conversation, messages: initialMsgs, contactId }: ThreadProps) {
  const [messages, setMessages] = useState<GHLMessage[]>(initialMsgs);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = replyText.trim();
    if (!text || sending) return;

    const optimisticId = `opt-${Date.now()}`;
    const optimisticMsg: GHLMessage = {
      id: optimisticId,
      conversationId: conversation.id,
      locationId: conversation.locationId,
      contactId,
      body: text,
      type: "TYPE_SMS",
      direction: "outbound",
      status: "pending",
      contentType: "text/plain",
      dateAdded: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setReplyText("");
    setSending(true);

    try {
      const res = await fetch(`/api/ghl/conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "TYPE_SMS" as GHLMessageType,
          message: text,
          contactId,
        }),
      });

      if (!res.ok) throw new Error("Send failed");

      const real: GHLMessage = await res.json();
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? real : m)),
      );
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setReplyText(text);
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="flex h-[420px] flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-[var(--text-secondary)] py-8">
            No messages yet.
          </p>
        ) : (
          messages.map((msg) => {
            const isOutbound = msg.direction === "outbound";
            const isPending = msg.id.startsWith("opt-");
            return (
              <div
                key={msg.id}
                className={cn("flex", isOutbound ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[72%] rounded-2xl px-3.5 py-2 text-sm",
                    isOutbound
                      ? "rounded-br-sm bg-teal-600 text-white"
                      : "rounded-bl-sm bg-slate-100 text-slate-800",
                    isPending && "opacity-60",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                  <p
                    className={cn(
                      "mt-1 text-[10px]",
                      isOutbound ? "text-teal-100" : "text-slate-400",
                    )}
                  >
                    {isPending ? "Sending…" : formatRelativeTime(msg.dateAdded)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-[var(--v48-border)] px-3 py-2">
        <div className="flex items-end gap-2">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply… (Enter to send)"
            rows={2}
            className="flex-1 resize-none rounded-lg border border-[var(--v48-border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--v48-accent)]"
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!replyText.trim() || sending}
            className="mb-0.5 h-9 w-9 p-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ContactConversation({ conversations, initialMessages, contactId }: Props) {
  if (conversations.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--v48-border)] bg-white">
        <div className="border-b border-[var(--v48-border)] px-5 py-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Conversations</h2>
        </div>
        <p className="px-5 py-4 text-sm text-[var(--text-secondary)]">
          No conversations found.
        </p>
      </div>
    );
  }

  // Group messages by conversationId
  const msgsByConv = new Map<string, GHLMessage[]>();
  for (const msg of initialMessages) {
    const list = msgsByConv.get(msg.conversationId) ?? [];
    list.push(msg);
    msgsByConv.set(msg.conversationId, list);
  }

  return (
    <div className="rounded-2xl border border-[var(--v48-border)] bg-white">
      <div className="border-b border-[var(--v48-border)] px-5 py-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Conversations</h2>
      </div>

      {conversations.length === 1 ? (
        <Thread
          conversation={conversations[0]}
          messages={msgsByConv.get(conversations[0].id) ?? []}
          contactId={contactId}
        />
      ) : (
        <Tabs defaultValue={conversations[0].id}>
          <TabsList className="mx-4 mt-3">
            {conversations.map((conv) => (
              <TabsTrigger key={conv.id} value={conv.id}>
                {typeLabel(conv.type)}
              </TabsTrigger>
            ))}
          </TabsList>
          {conversations.map((conv) => (
            <TabsContent key={conv.id} value={conv.id}>
              <Thread
                conversation={conv}
                messages={msgsByConv.get(conv.id) ?? []}
                contactId={contactId}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
