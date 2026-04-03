"use client";

import { useState, useEffect, useCallback } from "react";
import { CalendarWeekView } from "./CalendarWeekView";
import { CalendarDayView } from "./CalendarDayView";
import { AppointmentDetailSheet } from "./AppointmentDetailSheet";
import { AddAppointmentSheet } from "./AddAppointmentSheet";
import {
  getStartOfWeek,
  getWeekRange,
  addDays,
  fromDateString,
  toDateString,
} from "@/lib/crm/calendar-utils";
import type { GHLAppointment } from "@/lib/ghl/types";
import type { GHLCalendar } from "@/lib/ghl/types";

interface Props {
  initialAppointments: GHLAppointment[];
  initialWeekStart: string; // ISO date string for Monday of initial week
  calendars: GHLCalendar[];
  timezone: string;
  reminderActive: boolean;
}

type ViewMode = "week" | "day";

export function CalendarClientShell({
  initialAppointments,
  initialWeekStart,
  calendars,
  timezone,
  reminderActive,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [weekStart, setWeekStart] = useState<Date>(() => fromDateString(initialWeekStart));
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const today = new Date();
    const ws = fromDateString(initialWeekStart);
    // Select today if it's in the initial week, else select Monday
    const diff = Math.floor((today.getTime() - ws.getTime()) / 86400000);
    return diff >= 0 && diff < 7 ? today : ws;
  });
  const [appointments, setAppointments] = useState<GHLAppointment[]>(initialAppointments);
  const [selectedAppointment, setSelectedAppointment] = useState<GHLAppointment | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Detect mobile on mount to default to day view
  useEffect(() => {
    if (window.innerWidth < 768) {
      setViewMode("day");
    }
  }, []);

  const fetchAppointments = useCallback(async (ws: Date) => {
    const { startDate, endDate } = getWeekRange(ws);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/ghl/appointments?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setAppointments(data.events ?? []);
    } catch {
      // silently fail — stale data is better than crash
    } finally {
      setLoading(false);
    }
  }, []);

  // Navigation
  function goToWeek(newWeekStart: Date) {
    setWeekStart(newWeekStart);
    fetchAppointments(newWeekStart);
  }

  function prevWeek() {
    goToWeek(addDays(weekStart, -7));
  }

  function nextWeek() {
    goToWeek(addDays(weekStart, 7));
  }

  function prevDay() {
    const newDate = addDays(selectedDate, -1);
    setSelectedDate(newDate);
    const newWeekStart = getStartOfWeek(newDate);
    if (newWeekStart.getTime() !== weekStart.getTime()) {
      goToWeek(newWeekStart);
    }
  }

  function nextDay() {
    const newDate = addDays(selectedDate, 1);
    setSelectedDate(newDate);
    const newWeekStart = getStartOfWeek(newDate);
    if (newWeekStart.getTime() !== weekStart.getTime()) {
      goToWeek(newWeekStart);
    }
  }

  function goToday() {
    const today = new Date();
    setSelectedDate(today);
    const newWeekStart = getStartOfWeek(today);
    goToWeek(newWeekStart);
  }

  function handleSelectDay(day: Date) {
    setSelectedDate(day);
  }

  function handleAppointmentClick(apt: GHLAppointment) {
    setSelectedAppointment(apt);
  }

  function handleAppointmentUpdated(updated: GHLAppointment) {
    setAppointments((prev) =>
      prev.map((apt) => (apt.id === updated.id ? updated : apt)),
    );
    setSelectedAppointment(updated);
  }

  function handleCreated() {
    // Refetch appointments for current week
    fetchAppointments(weekStart);
  }

  const sharedProps = {
    appointments,
    timezone,
    reminderActive,
    onAppointmentClick: handleAppointmentClick,
    onAddClick: () => setAddSheetOpen(true),
    onToday: goToday,
  };

  return (
    <div className="flex h-[calc(100vh-var(--header-height,4rem))] flex-col">
      {/* View mode toggle (desktop only) */}
      <div className="hidden items-center justify-end gap-1 border-b px-4 py-1.5 md:flex">
        {loading && (
          <span className="mr-2 text-xs text-text-secondary">Loading…</span>
        )}
        <button
          onClick={() => setViewMode("week")}
          className={[
            "rounded px-2 py-1 text-xs font-medium transition-colors",
            viewMode === "week"
              ? "bg-brand-primary text-white"
              : "hover:bg-bg-secondary text-text-secondary",
          ].join(" ")}
        >
          Week
        </button>
        <button
          onClick={() => setViewMode("day")}
          className={[
            "rounded px-2 py-1 text-xs font-medium transition-colors",
            viewMode === "day"
              ? "bg-brand-primary text-white"
              : "hover:bg-bg-secondary text-text-secondary",
          ].join(" ")}
        >
          Day
        </button>
      </div>

      {/* Calendar body */}
      <div className="flex-1 overflow-hidden">
        {viewMode === "week" ? (
          <CalendarWeekView
            weekStart={weekStart}
            onPrevWeek={prevWeek}
            onNextWeek={nextWeek}
            {...sharedProps}
          />
        ) : (
          <CalendarDayView
            selectedDate={selectedDate}
            weekStart={weekStart}
            onPrevDay={prevDay}
            onNextDay={nextDay}
            onSelectDay={handleSelectDay}
            {...sharedProps}
          />
        )}
      </div>

      {/* Detail sheet */}
      <AppointmentDetailSheet
        appointment={selectedAppointment}
        timezone={timezone}
        reminderActive={reminderActive}
        onClose={() => setSelectedAppointment(null)}
        onUpdated={handleAppointmentUpdated}
      />

      {/* Add sheet */}
      <AddAppointmentSheet
        open={addSheetOpen}
        onOpenChange={setAddSheetOpen}
        calendars={calendars}
        onCreated={handleCreated}
      />
    </div>
  );
}
