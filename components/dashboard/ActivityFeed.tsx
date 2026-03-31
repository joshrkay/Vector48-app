"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Activity, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatActivityDescription } from "@/lib/dashboard/formatActivityDescription";
import { formatRelativeTime } from "@/lib/dashboard/formatRelativeTime";
import { getActivityStatus } from "@/lib/dashboard/activityStatus";
import { getStageDotClass } from "@/lib/dashboard/stageDotClass";

export interface ActivityEventDTO {
  id: string;
  recipe_slug: string | null;
  event_type: string;
  summary: string;
  detail: Record<string, unknown>;
  created_at: string;
}

interface ActivityFeedProps {
  initialEvents: ActivityEventDTO[];
  initialHasMore: boolean;
  initialNextOffset: number;
}

export function ActivityFeed({
  initialEvents,
  initialHasMore,
  initialNextOffset,
}: ActivityFeedProps) {
  const [events, setEvents] = useState<ActivityEventDTO[]>(initialEvents);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [loading, setLoading] = useState(false);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/dashboard/activity?offset=${nextOffset}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        events: ActivityEventDTO[];
        nextOffset: number;
        hasMore: boolean;
      };
      setEvents((prev) => [...prev, ...data.events]);
      setNextOffset(data.nextOffset);
      setHasMore(data.hasMore);
    } finally {
      setLoading(false);
    }
  }, [hasMore, loading, nextOffset]);

  // Empty state only when there is nothing to show and no further pages to fetch.
  // If the first page is empty but hasMore is true, we still render the list
  // section so "Load more" can fetch the next offset.
  if (events.length === 0 && !hasMore) {
    return (
      <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900/30 px-6 py-16 text-center">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-4">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-slate-800/80 text-slate-400">
            <Inbox className="h-8 w-8" strokeWidth={1.25} />
            <Activity
              className="absolute bottom-2 right-2 h-5 w-5 text-[var(--v48-accent)]"
              strokeWidth={2}
            />
          </div>
          <div>
            <p className="font-heading text-lg font-semibold text-white">
              No activity yet
            </p>
            <p className="mt-2 text-sm text-slate-400">
              Once your recipes are active and handling calls, messages, and
              follow-ups, you&apos;ll see everything here.
            </p>
          </div>
          <Button
            asChild
            className="mt-2 bg-[var(--v48-accent)] text-[var(--brand)] hover:bg-[var(--v48-accent)]/90"
          >
            <Link href="/recipes">Explore Recipes</Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <h2 className="mb-4 font-heading text-lg font-semibold text-[var(--text-primary)]">
        Recent activity
      </h2>
      <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/30">
        {events.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-slate-500">
            No events in this batch. Load more to see older activity.
          </li>
        ) : (
          events.map((row) => {
            const detail =
              row.detail && typeof row.detail === "object"
                ? row.detail
                : ({} as Record<string, unknown>);
            const description = formatActivityDescription(
              row.event_type,
              detail,
              row.summary,
            );
            const badge = getActivityStatus(row.event_type, detail);
            const dotClass = getStageDotClass(row.recipe_slug);

            return (
              <li
                key={row.id}
                className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-white">{description}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatRelativeTime(row.created_at)}
                    </p>
                  </div>
                </div>
                <span
                  className={
                    badge === "success"
                      ? "shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400"
                      : "shrink-0 rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-medium text-red-400"
                  }
                >
                  {badge === "success" ? "Success" : "Failed"}
                </span>
              </li>
            );
          })
        )}
      </ul>
      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={loadMore}
            className="border-slate-700 text-slate-200 hover:bg-slate-800"
          >
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
