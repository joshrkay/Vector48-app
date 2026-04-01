"use client";

import { useMemo } from "react";
import { MessageSquare } from "lucide-react";
import { ActivityItem } from "@/components/dashboard/ActivityItem";
import { formatRelativeTime } from "@/lib/dashboard/formatRelativeTime";
import type { Database } from "@/lib/supabase/types";
import type { GHLMessage } from "@/lib/ghl/types";

type AutomationEvent = Database["public"]["Tables"]["automation_events"]["Row"];

interface TimelineItem {
  id: string;
  timestamp: string;
  source: "automation_event" | "ghl_message";
  automationEvent?: AutomationEvent;
  ghlMessage?: GHLMessage;
}

interface Props {
  automationEvents: AutomationEvent[] | null;
  ghlMessages: GHLMessage[] | null;
}

function mergeTimeline(
  automationEvents: AutomationEvent[],
  ghlMessages: GHLMessage[],
): TimelineItem[] {
  const items = new Map<string, TimelineItem>();

  // Automation events first — ghl_event_id is the dedup key
  for (const event of automationEvents) {
    const key = event.ghl_event_id ?? `local-${event.id}`;
    items.set(key, {
      id: event.id,
      timestamp: event.created_at,
      source: "automation_event",
      automationEvent: event,
    });
  }

  // GHL messages — skip if already covered by automation_events
  for (const msg of ghlMessages) {
    if (!items.has(msg.id)) {
      items.set(msg.id, {
        id: msg.id,
        timestamp: msg.dateAdded,
        source: "ghl_message",
        ghlMessage: msg,
      });
    }
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

export function ContactTimeline({ automationEvents, ghlMessages }: Props) {
  const nowTick = Date.now();

  const items = useMemo(
    () => mergeTimeline(automationEvents ?? [], ghlMessages ?? []),
    [automationEvents, ghlMessages],
  );

  const hasError = automationEvents === null && ghlMessages === null;

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
            ) : item.ghlMessage ? (
              <GHLMessageItem key={item.id} message={item.ghlMessage} />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
