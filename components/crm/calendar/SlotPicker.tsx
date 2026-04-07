"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GHLCalendarSlot } from "@/lib/ghl/types";

interface Props {
  calendarId: string | null;
  onSelectSlot: (slot: GHLCalendarSlot) => void;
  selectedSlot?: GHLCalendarSlot | null;
}

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function SlotPicker({ calendarId, onSelectSlot, selectedSlot }: Props) {
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateStr(new Date()));
  const [slots, setSlots] = useState<Record<string, GHLCalendarSlot[]> | GHLCalendarSlot[]>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch slots when calendar or date changes
  useEffect(() => {
    if (!calendarId) {
      setSlots({});
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    // Fetch 7 days of slots starting from selectedDate
    const start = new Date(selectedDate + "T00:00:00");
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    fetch(
      `/api/ghl/calendars/${encodeURIComponent(calendarId)}/slots?startDate=${start.toISOString()}&endDate=${end.toISOString()}&timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`,
      { signal: controller.signal },
    )
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load slots");
        return res.json();
      })
      .then((data) => {
        setSlots(data.slots ?? data ?? {});
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Could not load available times");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [calendarId, selectedDate]);

  // Normalize slots into a date-keyed object
  const slotsByDate = useMemo(() => {
    if (Array.isArray(slots)) {
      const grouped: Record<string, GHLCalendarSlot[]> = {};
      for (const slot of slots) {
        const dateKey = toLocalDateStr(new Date(slot.startTime));
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(slot);
      }
      return grouped;
    }
    return slots as Record<string, GHLCalendarSlot[]>;
  }, [slots]);

  const slotsForDate = slotsByDate[selectedDate] ?? [];

  function navigateDate(delta: number) {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + delta);
    setSelectedDate(toLocalDateStr(d));
  }

  const dateLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  if (!calendarId) {
    return (
      <p className="text-xs text-[var(--text-secondary)]">Select a calendar to see available slots.</p>
    );
  }

  return (
    <div className="space-y-2">
      {/* Date navigation */}
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={() => navigateDate(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">{dateLabel}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => navigateDate(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Slot grid */}
      {loading && (
        <p className="py-3 text-center text-xs text-[var(--text-secondary)]">Loading slots...</p>
      )}

      {error && (
        <p className="py-3 text-center text-xs text-red-600">{error}</p>
      )}

      {!loading && !error && slotsForDate.length === 0 && (
        <p className="py-3 text-center text-xs text-[var(--text-secondary)]">No available slots for this date.</p>
      )}

      {!loading && slotsForDate.length > 0 && (
        <div className="grid max-h-48 grid-cols-3 gap-1.5 overflow-y-auto">
          {slotsForDate.map((slot) => {
            const isSelected =
              selectedSlot?.startTime === slot.startTime &&
              selectedSlot?.endTime === slot.endTime;
            return (
              <button
                key={slot.startTime}
                type="button"
                onClick={() => onSelectSlot(slot)}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                  isSelected
                    ? "border-[var(--v48-accent)] bg-[var(--v48-accent)] text-white"
                    : "border-gray-200 bg-white text-[var(--text-primary)] hover:border-[var(--v48-accent)] hover:bg-[var(--v48-accent-light)]",
                )}
              >
                {formatSlotTime(slot.startTime)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
