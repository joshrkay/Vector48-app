"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Inbox } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { ActivityItem } from "@/components/dashboard/ActivityItem";
import { useRealtimeInserts } from "@/lib/supabase/realtime";
import type { Database } from "@/lib/supabase/types";

type AutomationEvent = Database["public"]["Tables"]["automation_events"]["Row"];

interface ActivityFeedProps {
  initialItems: AutomationEvent[];
  initialNextCursor: string | null;
  accountId: string;
  accountCreatedAt: string;
}

export function ActivityFeed({
  initialItems,
  initialNextCursor,
  accountId,
  accountCreatedAt,
}: ActivityFeedProps) {
  const searchParams = useSearchParams();
  const recipe = searchParams.get("recipe") ?? "all";

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
      if (recipe !== "all") params.set("recipe", recipe);
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
  }, [dedupeMerge, nextCursor, recipe]);

  useEffect(() => {
    setItems(initialItems);
    setNextCursor(initialNextCursor);
  }, [initialItems, initialNextCursor, recipe]);

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
      if (recipe !== "all" && newRow.recipe_slug !== recipe) return;

      if (window.scrollY > 120) {
        pendingPreserveRef.current = {
          height: document.body.scrollHeight,
          y: window.scrollY,
        };
      }

      setItems((prev) => dedupeMerge(prev, [newRow], true));
    },
    [dedupeMerge, recipe],
  );

  useRealtimeInserts("automation_events", `account_id=eq.${accountId}`, handleRealtimeInsert);

  const withinFirst24Hours = useMemo(() => {
    const accountAgeMs = Date.now() - new Date(accountCreatedAt).getTime();
    return accountAgeMs <= 24 * 60 * 60 * 1000;
  }, [accountCreatedAt]);

  if (items.length === 0 && withinFirst24Hours) {
    return (
      <section className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
          <div className="rounded-full bg-slate-100 p-4">
            <Inbox className="h-8 w-8 text-slate-500" />
          </div>
          <p className="font-heading text-[18px] text-[var(--text-primary)]">
            Your first automation is warming up.
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            Activity will appear here once a recipe triggers.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-4 space-y-3">
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
      {loading ? <p className="text-center text-xs text-slate-500">Loading…</p> : null}
      {!hasMore && items.length > 0 ? (
        <p className="pb-2 text-center text-xs text-slate-400">You&apos;re all caught up.</p>
      ) : null}
    </section>
  );
}
