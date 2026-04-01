"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
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
  { color: string; icon: typeof Activity }
> = {
  call_answered: { color: "#00B4A6", icon: Phone },
  lead_outreach_sent: {
    color: "#8B5CF6",
    icon: MessageSquare,
  },
  review_request_sent: { color: "#F59E0B", icon: Star },
  appointment_confirmed: {
    color: "#10B981",
    icon: Calendar,
  },
};

export function ActivityItem({ event, nowTick }: { event: AutomationEvent; nowTick: number }) {
  const [expanded, setExpanded] = useState(false);
  const config = eventTypeMap[event.event_type] ?? {
    color: "#E2E8F0",
    icon: Activity,
  };
  const Icon = config.icon;

  const detail = useMemo(
    () => (event.detail && typeof event.detail === "object" ? event.detail : {}),
    [event.detail],
  );
  const detailJson = useMemo(() => JSON.stringify(detail, null, 2), [detail]);

  // nowTick is passed as a prop to trigger re-renders; formatRelativeTime is cheap enough to call directly
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const relative = useMemo(() => formatRelativeTime(event.created_at), [event.created_at, nowTick]);

  return (
    <article className="border-b border-[#E2E8F0] last:border-0">
      <div className="flex items-start gap-3 py-3">
        <div
          className="mt-1 h-10 w-[3px] shrink-0 rounded-full"
          style={{ backgroundColor: config.color }}
        />
        <Icon
          className="mt-0.5 h-[18px] w-[18px] shrink-0"
          style={{ color: config.color }}
        />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="flex w-full items-start justify-between gap-3 text-left"
          >
            <div className="min-w-0">
              <p className="text-[14px] text-[#0F1923]">{event.summary}</p>
              <p className="mt-1 text-[12px] text-[#64748B]">{relative}</p>
            </div>
            <ChevronDown
              className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
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
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl bg-[#F8FAFC] p-3 text-[12px] text-[#334155]">
                  {detailJson}
                </pre>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </article>
  );
}
