"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  Calendar,
  ChevronDown,
  MessageSquare,
  Phone,
  Star,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/dashboard/formatRelativeTime";
import type { Database } from "@/lib/supabase/types";

type AutomationEvent = Database["public"]["Tables"]["automation_events"]["Row"];

const eventTypeMap: Record<
  string,
  { border: string; icon: typeof Bell; iconColor: string }
> = {
  call_completed: { border: "border-l-teal-400", icon: Phone, iconColor: "text-teal-400" },
  message_received: {
    border: "border-l-violet-400",
    icon: MessageSquare,
    iconColor: "text-violet-400",
  },
  review_requested: { border: "border-l-amber-400", icon: Star, iconColor: "text-amber-400" },
  appointment_confirmed: {
    border: "border-l-green-400",
    icon: Calendar,
    iconColor: "text-green-400",
  },
  opportunity_moved: {
    border: "border-l-gray-400",
    icon: Bell,
    iconColor: "text-gray-400",
  },
};

function getCrmLink(event: AutomationEvent) {
  if (event.contact_id) return `/crm/contacts/${event.contact_id}`;
  if (event.event_type === "appointment_confirmed") return "/crm/calendar";
  if (event.event_type === "opportunity_moved") return "/crm/pipeline";
  if (event.event_type === "message_received") return "/crm/inbox";
  return "/crm/contacts";
}

export function ActivityItem({ event, nowTick }: { event: AutomationEvent; nowTick: number }) {
  const [expanded, setExpanded] = useState(false);
  const config = eventTypeMap[event.event_type] ?? {
    border: "border-l-gray-400",
    icon: Bell,
    iconColor: "text-gray-400",
  };
  const Icon = config.icon;

  const detail = useMemo(
    () => (event.detail && typeof event.detail === "object" ? event.detail : {}),
    [event.detail],
  );

  const relative = useMemo(() => formatRelativeTime(event.created_at), [event.created_at, nowTick]);

  return (
    <article className={`border-l-4 ${config.border} bg-white px-4 py-3`}>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="flex min-w-0 gap-3">
          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${config.iconColor}`} />
          <div className="min-w-0">
            <p className="text-sm text-[var(--text-primary)]">{event.summary}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{relative}</p>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              {event.event_type === "call_completed" ? (
                <>
                  <p>{String(detail.transcript ?? "No transcript available")}</p>
                  <p className="text-xs text-slate-500">
                    Duration: {String(detail.duration ?? "—")} · Direction: {String(detail.direction ?? "—")}
                  </p>
                </>
              ) : null}

              {event.event_type === "message_received" ? (
                <div className="rounded-md bg-white p-2">{String(detail.message_text ?? event.summary)}</div>
              ) : null}

              {event.event_type === "appointment_confirmed" ? (
                <>
                  <p>Contact: {String(detail.contact_name ?? event.contact_name ?? "Unknown")}</p>
                  <p>Date/Time: {String(detail.starts_at ?? detail.date_time ?? "—")}</p>
                  <p>Status: {String(detail.status ?? "confirmed")}</p>
                </>
              ) : null}

              {event.event_type === "opportunity_moved" ? (
                <>
                  <p>Pipeline: {String(detail.pipeline_name ?? "—")}</p>
                  <p>Stage: {String(detail.stage_name ?? detail.to_stage ?? "—")}</p>
                </>
              ) : null}

              <Link href={getCrmLink(event)} className="inline-block pt-1 text-xs font-medium text-[var(--v48-accent)]">
                View in CRM →
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </article>
  );
}
