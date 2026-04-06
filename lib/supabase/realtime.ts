"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type TableName = keyof Database["public"]["Tables"];

type RowForTable<T extends TableName> = Database["public"]["Tables"][T]["Row"];

export function useRealtimeInserts<T extends TableName>(
  table: T,
  filter: string,
  onInsert: (row: RowForTable<T>) => void,
  options?: { enabled?: boolean },
) {
  const [realtimeAvailable, setRealtimeAvailable] = useState(true);
  const didReportLifecycleIssueRef = useRef(false);

  useEffect(() => {
    const enabled = options?.enabled ?? true;
    if (!enabled || !filter.trim()) {
      setRealtimeAvailable(false);
      return;
    }

    const supabase = createBrowserClient();
    let isMounted = true;

    const channelName = `realtime:${String(table)}:${filter}`;
    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: String(table),
          filter,
        },
        (payload) => {
          onInsert(payload.new as RowForTable<T>);
        },
      )
      .subscribe((status: "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR") => {
        if (!isMounted) return;

        if (status === "SUBSCRIBED") {
          setRealtimeAvailable(true);
          return;
        }

        if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && !didReportLifecycleIssueRef.current) {
          didReportLifecycleIssueRef.current = true;
          console.error("[realtime] channel lifecycle issue", {
            table: String(table),
            filter,
            status,
          });
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRealtimeAvailable(false);
        }
      });

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [filter, onInsert, options?.enabled, table]);

  return { realtimeAvailable };
}
