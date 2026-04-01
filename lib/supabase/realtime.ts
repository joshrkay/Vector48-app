"use client";

import { useEffect } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type TableName = keyof Database["public"]["Tables"];

type RowForTable<T extends TableName> = Database["public"]["Tables"][T]["Row"];

export function useRealtimeInserts<T extends TableName>(
  table: T,
  filter: string,
  onInsert: (row: RowForTable<T>) => void,
) {
  useEffect(() => {
    const supabase = createBrowserClient();

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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [filter, onInsert, table]);
}
