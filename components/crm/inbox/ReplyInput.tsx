"use client";

import { useCallback, useRef, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { countSmsSegments } from "@/lib/crm/smsSegments";
import type { GHLMessage } from "@/lib/ghl/types";

interface Props {
  conversationId: string | null;
  contactId: string | null;
  locationId: string;
  recipeActive: boolean;
  onDraft: (msg: GHLMessage | null) => void;
  onSent: () => void;
}

export function ReplyInput({
  conversationId,
  contactId,
  locationId,
  recipeActive,
  onDraft,
  onSent,
}: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !conversationId || !contactId) return;

    const optimisticId = `opt-${Date.now()}`;
    const optimistic: GHLMessage = {
      id: optimisticId,
      conversationId,
      locationId,
      contactId,
      body: trimmed,
      type: "TYPE_SMS",
      direction: "outbound",
      status: "pending",
      contentType: "text/plain",
      dateAdded: new Date().toISOString(),
    };

    onDraft(optimistic);
    setText("");
    setSending(true);
    adjustHeight();

    try {
      const res = await fetch(`/api/ghl/conversations/${encodeURIComponent(conversationId)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "TYPE_SMS",
          message: trimmed,
          contactId,
        }),
      });

      if (!res.ok) throw new Error("Send failed");
      const sentMessage = (await res.json()) as GHLMessage;

      onDraft(sentMessage);
      onSent();

      if (recipeActive) {
        const pauseRes = await fetch("/api/recipes/pause-for-contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId }),
        });
        if (!pauseRes.ok) {
          toast.error("Message sent, but the AI sequence could not be paused. It may continue running.");
        }
      }
    } catch {
      onDraft(null);
      setText(trimmed);
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  if (!conversationId || !contactId) {
    return null;
  }

  const segments = countSmsSegments(text);
  const charCount = text.length;

  return (
    <div className="border-t border-[var(--v48-border)] bg-white px-3 py-2">
      <div className="flex items-end gap-2">
        <div className="relative min-w-0 flex-1">
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              requestAnimationFrame(adjustHeight);
            }}
            onKeyDown={onKeyDown}
            placeholder="Reply… (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="max-h-40 min-h-[44px] w-full resize-none rounded-lg border border-[var(--v48-border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--v48-accent)]"
          />
          <div className="mt-1 flex justify-between gap-2 text-[10px] text-[var(--text-secondary)]">
            <span>
              {charCount} chars{segments > 0 ? ` · ${segments} SMS segment${segments === 1 ? "" : "s"}` : ""}
            </span>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => void handleSend()}
          disabled={!text.trim() || sending}
          className="mb-6 h-9 shrink-0 bg-[var(--v48-accent)] hover:bg-[var(--v48-accent)]/90"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
