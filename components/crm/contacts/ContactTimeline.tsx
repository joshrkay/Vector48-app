"use client";

import { useMemo } from "react";
import { MessageSquare, StickyNote } from "lucide-react";
import { ActivityItem } from "@/components/dashboard/ActivityItem";
import { formatRelativeTime } from "@/lib/dashboard/formatRelativeTime";
import type { Database } from "@/lib/supabase/types";
import type { GHLMessage, GHLNote } from "@/lib/ghl/types";

type AutomationEvent = Database["public"]["Tables"]["automation_events"]["Row"];

interface TimelineItem {
  id: string;
  timestamp: string;
  source: "automation_event" | "ghl_message" | "ghl_note";
  automationEvent?: AutomationEvent;
  ghlMessage?: GHLMessage;
  ghlNote?: GHLNote;
}

interface Props {
  automationEvents: AutomationEvent[] | null;
  /** null when the conversations/messages fetch failed (distinct from empty thread). */
  ghlMessages: GHLMessage[] | null;
  /** null when the GHL notes fetch failed. */
  ghlNotes: GHLNote[] | null;
}

function detailMaybeNoteId(detail: AutomationEvent["detail"]): string | null {
  if (!detail || typeof detail !== "object") return null;
  const o = detail as Record<string, unknown>;
  const id =
    typeof o.noteId === "string"
      ? o.noteId
      : typeof o.note_id === "string"
        ? o.note_id
        : typeof o.ghl_note_id === "string"
          ? o.ghl_note_id
          : null;
  return id;
}

function detailMaybeMessageId(detail: AutomationEvent["detail"]): string | null {
  if (!detail || typeof detail !== "object") return null;
  const o = detail as Record<string, unknown>;
  return typeof o.messageId === "string"
    ? o.messageId
    : typeof o.message_id === "string"
      ? o.message_id
      : typeof o.ghl_message_id === "string"
        ? o.ghl_message_id
        : null;
}

function mergeTimeline(
  automationEvents: AutomationEvent[],
  ghlMessages: GHLMessage[] | null,
  ghlNotes: GHLNote[] | null,
): TimelineItem[] {
  const items = new Map<string, TimelineItem>();
  const noteIdsInAutomation = new Set<string>();
  const messageIdsInAutomation = new Set<string>();

  for (const event of automationEvents) {
    const key = event.ghl_event_id ?? `local-${event.id}`;
    items.set(key, {
      id: event.id,
      timestamp: event.created_at,
      source: "automation_event",
      automationEvent: event,
    });
    const nid = detailMaybeNoteId(event.detail);
    if (nid) noteIdsInAutomation.add(nid);
    const mid = detailMaybeMessageId(event.detail);
    if (mid) messageIdsInAutomation.add(mid);
  }

  const messages = ghlMessages ?? [];
  for (const msg of messages) {
    if (messageIdsInAutomation.has(msg.id)) continue;
    if (!items.has(msg.id)) {
      items.set(msg.id, {
        id: msg.id,
        timestamp: msg.dateAdded,
        source: "ghl_message",
        ghlMessage: msg,
      });
    }
  }

  const notes = ghlNotes ?? [];
  for (const note of notes) {
    if (noteIdsInAutomation.has(note.id)) continue;
    const key = `ghl-note-${note.id}`;
    if (items.has(note.id) || items.has(key)) continue;
    items.set(key, {
      id: key,
      timestamp: note.dateAdded,
      source: "ghl_note",
      ghlNote: note,
    });
  }

  return Array.from(items.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

function GHLMessageItem({ message }: { message: GHLMessage }) {
  const isOutbound = message.direction === "outbound";
  return (
    <article className="border-l-4 border-l-violet-400 bg-white px-4 py-3">
      <div className="flex items-start gap-3">
        <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
        <div className="min-w-0">
          <p className="text-sm text-[var(--text-primary)]">
            {isOutbound ? "Outbound message" : "Inbound message"}
            {message.body ? `: ${message.body.slice(0, 120)}${message.body.length > 120 ? "…" : ""}` : ""}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {formatRelativeTime(message.dateAdded)} · {message.type.replace("TYPE_", "").replace("_", " ")}
          </p>
        </div>
      </div>
    </article>
  );
}

function GHLNoteItem({ note }: { note: GHLNote }) {
  return (
    <article className="border-l-4 border-l-amber-400 bg-white px-4 py-3">
      <div className="flex items-start gap-3">
        <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div className="min-w-0">
          <p className="text-sm text-[var(--text-primary)]">
            Note
            {note.body ? `: ${note.body.slice(0, 120)}${note.body.length > 120 ? "…" : ""}` : ""}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {formatRelativeTime(note.dateAdded)}
          </p>
        </div>
      </div>
    </article>
  );
}

export function ContactTimeline({
  automationEvents,
  ghlMessages,
  ghlNotes,
}: Props) {
  const nowTick = Date.now();

  const items = useMemo(
    () => mergeTimeline(automationEvents ?? [], ghlMessages, ghlNotes),
    [automationEvents, ghlMessages, ghlNotes],
  );

  const hasError =
    automationEvents === null && ghlMessages === null && ghlNotes === null;

  return (
    <div className="rounded-2xl border border-[var(--v48-border)] bg-white">
      <div className="border-b border-[var(--v48-border)] px-5 py-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Activity Timeline</h2>
      </div>

      {hasError ? (
        <p className="px-5 py-4 text-sm text-[var(--text-secondary)]">
          Could not load timeline.
        </p>
      ) : items.length === 0 ? (
        <p className="px-5 py-4 text-sm text-[var(--text-secondary)]">No activity yet.</p>
      ) : (
        <div className="divide-y divide-[var(--v48-border)]">
          {items.map((item) =>
            item.source === "automation_event" && item.automationEvent ? (
              <ActivityItem
                key={item.id}
                event={item.automationEvent}
                nowTick={nowTick}
              />
            ) : item.source === "ghl_message" && item.ghlMessage ? (
              <GHLMessageItem key={item.id} message={item.ghlMessage} />
            ) : item.source === "ghl_note" && item.ghlNote ? (
              <GHLNoteItem key={item.id} note={item.ghlNote} />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
