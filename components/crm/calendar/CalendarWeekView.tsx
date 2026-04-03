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
  addDays,
  formatWeekRange,
} from "@/lib/crm/calendar-utils";
import type { GHLAppointment } from "@/lib/ghl/types";
import type { LayoutAppointment } from "@/lib/crm/calendar-utils";

interface Props {
  weekStart: Date;
  appointments: GHLAppointment[];
  timezone: string;
  reminderActive: boolean;
  onAppointmentClick: (apt: GHLAppointment) => void;
  onAddClick: () => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
}

const HOUR_HEIGHT = 60; // px per hour
const TOTAL_HEIGHT = HOUR_HEIGHT * 24; // 1440px
const TIME_COL_WIDTH = 60; // px
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function WeekHeader({
  weekStart,
  timezone,
  onPrevWeek,
  onNextWeek,
  onToday,
}: {
  weekStart: Date;
  timezone: string;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
}) {
  const days = getWeekDays(weekStart);
  const weekRangeLabel = formatWeekRange(days[0], days[6]);

  return (
    <div className="sticky top-0 z-20 bg-bg-primary border-b">
      {/* Navigation row */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onPrevWeek}>
            ‹
          </Button>
          <Button variant="outline" size="sm" onClick={onNextWeek}>
            ›
          </Button>
          <Button variant="outline" size="sm" onClick={onToday}>
            Today
          </Button>
        </div>
        <span className="text-sm font-medium">{weekRangeLabel}</span>
      </div>
      {/* Day header row */}
      <div
        className="grid"
        style={{ gridTemplateColumns: `${TIME_COL_WIDTH}px repeat(7, 1fr)` }}
      >
        <div /> {/* time col spacer */}
        {days.map((day) => {
          const isToday = isTodayInTz(day, timezone);
          return (
            <div
              key={day.toISOString()}
              className="border-l py-2 text-center"
            >
              <div className="text-xs text-text-secondary uppercase tracking-wide">
                {getWeekdayInTz(day, timezone)}
              </div>
              <div
                className={[
                  "mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
                  isToday
                    ? "bg-brand-primary text-white"
                    : "text-text-primary",
                ].join(" ")}
              >
                {getDayOfMonthInTz(day, timezone)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface DayColumnProps {
  date: Date;
  appointments: LayoutAppointment[];
  isToday: boolean;
  timezone: string;
  reminderActive: boolean;
  currentMinutes: number | null; // null if not today
  onAppointmentClick: (apt: GHLAppointment) => void;
}

function DayColumn({
  appointments,
  isToday,
  currentMinutes,
  timezone,
  reminderActive,
  onAppointmentClick,
}: DayColumnProps) {
  return (
    <div
      className="relative border-l"
      style={{ height: TOTAL_HEIGHT }}
    >
      {/* Hour separator lines */}
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
      {isToday && currentMinutes !== null && (
        <div
          className="absolute left-0 right-0 z-10 flex items-center"
          style={{ top: currentMinutes - 1 }}
        >
          <div className="h-2.5 w-2.5 rounded-full bg-red-500 -ml-1.5" />
          <div className="flex-1 h-0.5 bg-red-500" />
        </div>
      )}

      {/* Appointment cards */}
      {appointments.map((apt) => (
        <AppointmentCard
          key={apt.id}
          appointment={apt}
          timezone={timezone}
          reminderActive={reminderActive}
          onClick={onAppointmentClick}
        />
      ))}
    </div>
  );
}

export function CalendarWeekView({
  weekStart,
  appointments,
  timezone,
  reminderActive,
  onAppointmentClick,
  onAddClick,
  onPrevWeek,
  onNextWeek,
  onToday,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentMinutes, setCurrentMinutes] = useState<number>(() =>
    getMinutesFromMidnight(new Date().toISOString(), timezone),
  );

  // Scroll to 7am on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
    }
  }, []);

  // Update current time line every minute
  useEffect(() => {
    const tick = () =>
      setCurrentMinutes(getMinutesFromMidnight(new Date().toISOString(), timezone));
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [timezone]);

  const days = getWeekDays(weekStart);

  // Group appointments by day and compute layout per day
  const layoutByDay: Map<string, LayoutAppointment[]> = new Map();
  for (const day of days) {
    const dayApts = appointments.filter((apt) => isSameDayInTz(apt.startTime, day, timezone));
    layoutByDay.set(day.toISOString(), computeLayout(dayApts, timezone));
  }

  return (
    <div className="flex flex-col h-full">
      <WeekHeader
        weekStart={weekStart}
        timezone={timezone}
        onPrevWeek={onPrevWeek}
        onNextWeek={onNextWeek}
        onToday={onToday}
      />

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
          style={{ gridTemplateColumns: `${TIME_COL_WIDTH}px repeat(7, 1fr)` }}
        >
          {/* Time labels column */}
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

          {/* Day columns */}
          {days.map((day) => {
            const isToday = isTodayInTz(day, timezone);
            const dayApts = layoutByDay.get(day.toISOString()) ?? [];
            return (
              <DayColumn
                key={day.toISOString()}
                date={day}
                appointments={dayApts}
                isToday={isToday}
                currentMinutes={isToday ? currentMinutes : null}
                timezone={timezone}
                reminderActive={reminderActive}
                onAppointmentClick={onAppointmentClick}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
