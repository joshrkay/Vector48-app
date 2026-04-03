"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AppointmentCard } from "./AppointmentCard";
import {
  getWeekDays,
  getWeekdayInTz,
  getDayOfMonthInTz,
  isSameDayInTz,
  isTodayInTz,
  computeLayout,
  getMinutesFromMidnight,
  formatDayInTz,
  addDays,
} from "@/lib/crm/calendar-utils";
import type { GHLAppointment } from "@/lib/ghl/types";
import type { LayoutAppointment } from "@/lib/crm/calendar-utils";

interface Props {
  selectedDate: Date;
  weekStart: Date;
  appointments: GHLAppointment[];
  timezone: string;
  reminderActive: boolean;
  onAppointmentClick: (apt: GHLAppointment) => void;
  onAddClick: () => void;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onSelectDay: (day: Date) => void;
}

const HOUR_HEIGHT = 60;
const TOTAL_HEIGHT = HOUR_HEIGHT * 24;
const TIME_COL_WIDTH = 60;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

export function CalendarDayView({
  selectedDate,
  weekStart,
  appointments,
  timezone,
  reminderActive,
  onAppointmentClick,
  onAddClick,
  onPrevDay,
  onNextDay,
  onToday,
  onSelectDay,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentMinutes, setCurrentMinutes] = useState<number>(() =>
    getMinutesFromMidnight(new Date().toISOString(), timezone),
  );

  const weekDays = getWeekDays(weekStart);
  const isToday = isTodayInTz(selectedDate, timezone);

  // Scroll to 7am on mount and when date changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
    }
  }, [selectedDate]);

  // Update current time line every minute
  useEffect(() => {
    const tick = () =>
      setCurrentMinutes(getMinutesFromMidnight(new Date().toISOString(), timezone));
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [timezone]);

  const dayApts = appointments.filter((apt) =>
    isSameDayInTz(apt.startTime, selectedDate, timezone),
  );
  const layoutApts = computeLayout(dayApts, timezone);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-bg-primary border-b">
        {/* Navigation row */}
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onPrevDay}>
              ‹
            </Button>
            <Button variant="outline" size="sm" onClick={onNextDay}>
              ›
            </Button>
            <Button variant="outline" size="sm" onClick={onToday}>
              Today
            </Button>
          </div>
          <span className="text-sm font-medium">{formatDayInTz(selectedDate, timezone)}</span>
        </div>

        {/* Horizontal date scroller */}
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-1 px-3 py-2">
            {weekDays.map((day) => {
              const active = isSameDayInTz(day.toISOString(), selectedDate, timezone);
              const todayDay = isTodayInTz(day, timezone);
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => onSelectDay(day)}
                  className={[
                    "flex min-w-[44px] flex-col items-center rounded-lg px-2 py-1.5 text-xs transition-colors",
                    active
                      ? "bg-brand-primary text-white"
                      : todayDay
                      ? "bg-brand-primary/10 text-brand-primary font-medium"
                      : "hover:bg-bg-secondary text-text-primary",
                  ].join(" ")}
                >
                  <span className="uppercase tracking-wide opacity-75">
                    {getWeekdayInTz(day, timezone)}
                  </span>
                  <span className="mt-0.5 text-sm font-semibold">
                    {getDayOfMonthInTz(day, timezone)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Add button */}
      <div className="flex justify-end px-4 py-2 border-b">
        <Button size="sm" onClick={onAddClick}>
          + New Appointment
        </Button>
      </div>

      {/* Scrollable body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div
          className="grid"
          style={{ gridTemplateColumns: `${TIME_COL_WIDTH}px 1fr` }}
        >
          {/* Time labels */}
          <div className="relative" style={{ height: TOTAL_HEIGHT }}>
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute right-2 text-xs text-text-secondary"
                style={{ top: h * HOUR_HEIGHT - 8, height: HOUR_HEIGHT }}
              >
                {h > 0 ? formatHour(h) : ""}
              </div>
            ))}
          </div>

          {/* Single day column */}
          <div className="relative border-l" style={{ height: TOTAL_HEIGHT }}>
            {/* Hour lines */}
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 border-t border-border/50"
                style={{ top: h * HOUR_HEIGHT }}
              />
            ))}
            {/* Half-hour lines */}
            {HOURS.map((h) => (
              <div
                key={`half-${h}`}
                className="absolute left-0 right-0 border-t border-border/25"
                style={{ top: h * HOUR_HEIGHT + 30 }}
              />
            ))}

            {/* Current time line */}
            {isToday && (
              <div
                className="absolute left-0 right-0 z-10 flex items-center"
                style={{ top: currentMinutes - 1 }}
              >
                <div className="h-2.5 w-2.5 rounded-full bg-red-500 -ml-1.5" />
                <div className="flex-1 h-0.5 bg-red-500" />
              </div>
            )}

            {/* Appointments */}
            {layoutApts.map((apt) => (
              <AppointmentCard
                key={apt.id}
                appointment={apt}
                timezone={timezone}
                reminderActive={reminderActive}
                onClick={onAppointmentClick}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
