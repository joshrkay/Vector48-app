"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Inbox } from "lucide-react";
import { ActivityItem } from "@/components/dashboard/ActivityItem";
import { useRealtimeInserts } from "@/lib/supabase/realtime";
import type { Database } from "@/lib/supabase/types";

type AutomationEvent = Database["public"]["Tables"]["automation_events"]["Row"];

interface ActivityFeedProps {
  initialItems: AutomationEvent[];
  initialNextCursor: string | null;
  accountId: string;
}

export function ActivityFeed({
  initialItems,
  initialNextCursor,
  accountId,
}: ActivityFeedProps) {
  const [items, setItems] = useState<AutomationEvent[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isFetchingRef = useRef(false);
  const pendingPreserveRef = useRef<{ height: number; y: number } | null>(null);

  const hasMore = Boolean(nextCursor);

  const dedupeMerge = useCallback((current: AutomationEvent[], incoming: AutomationEvent[], prepend = false) => {
    const seen = new Set(current.map((item) => item.id));
    const filtered = incoming.filter((item) => !seen.has(item.id));
    return prepend ? [...filtered, ...current] : [...current, ...filtered];
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isFetchingRef.current) return;

    isFetchingRef.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("cursor", nextCursor);
      params.set("limit", "20");

      const res = await fetch(`/api/activity?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        items: AutomationEvent[];
        nextCursor: string | null;
      };

      setItems((prev) => dedupeMerge(prev, data.items));
      setNextCursor(data.nextCursor);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [dedupeMerge, nextCursor]);

  useEffect(() => {
    setItems(initialItems);
    setNextCursor(initialNextCursor);
  }, [initialItems, initialNextCursor]);

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { rootMargin: "240px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!pendingPreserveRef.current) return;

    const { height, y } = pendingPreserveRef.current;
    const delta = document.body.scrollHeight - height;
    if (delta > 0) {
      window.scrollTo({ top: y + delta });
    }
    pendingPreserveRef.current = null;
  }, [items]);

  const handleRealtimeInsert = useCallback(
    (newRow: AutomationEvent) => {
      if (window.scrollY > 120) {
        pendingPreserveRef.current = {
          height: document.body.scrollHeight,
          y: window.scrollY,
        };
      }

      setItems((prev) => dedupeMerge(prev, [newRow], true));
    },
    [dedupeMerge],
  );

  useRealtimeInserts("automation_events", `account_id=eq.${accountId}`, handleRealtimeInsert);

  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-10">
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-center">
          <div className="rounded-full bg-slate-100 p-4">
            <Inbox className="h-8 w-8 text-[#64748B]" />
          </div>
          <p className="text-[14px] text-[#64748B]">
            No activity yet. Activate a recipe to get started.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-1">
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {items.map((event) => (
            <motion.li
              key={event.id}
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              layout
            >
              <ActivityItem event={event} nowTick={nowTick} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <div ref={sentinelRef} className="h-8" aria-hidden />
      {loading ? <p className="pb-3 text-center text-xs text-slate-500">Loading…</p> : null}
      {!hasMore && items.length > 0 ? (
        <p className="pb-3 text-center text-xs text-slate-400">You&apos;re all caught up.</p>
      ) : null}
    </section>
  );
}
