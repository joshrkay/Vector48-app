// ---------------------------------------------------------------------------
// Calendar utilities — pure functions, no React, no external libs
// All timezone conversion uses Intl (built-in), no date-fns or moment.
// ---------------------------------------------------------------------------

import type { GHLAppointment, GHLAppointmentStatus } from "@/lib/ghl/types";

// ── Types ──────────────────────────────────────────────────────────────────

export type LayoutAppointment = GHLAppointment & {
  /** px from top of day column (1px = 1 minute) */
  top: number;
  /** px height of card (1px = 1 minute) */
  height: number;
  /** 0–1 fractional left offset within day column */
  left: number;
  /** 0–1 fractional width within day column */
  width: number;
};

// ── Date helpers ───────────────────────────────────────────────────────────

/** Returns the Monday of the ISO week containing `date`. */
export function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, …
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Returns an array of 7 Date objects (Mon → Sun) for the given week start. */
export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** Returns a new Date with `n` calendar days added. */
export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Formats a Date as YYYY-MM-DD (local calendar date, not UTC). */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parses a YYYY-MM-DD string into a local Date at midnight. */
export function fromDateString(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// ── Timezone conversion (Intl only) ────────────────────────────────────────

/**
 * Returns the hour and minute for a UTC ISO string in the given IANA timezone.
 * Works identically on server and client.
 */
export function getHourMinuteInTz(
  iso: string,
  tz: string,
): { hour: number; minute: number } {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  // Intl may return hour=24 for midnight in some locales
  return { hour: hour === 24 ? 0 : hour, minute };
}

/** Returns minutes from midnight (0–1439) for a UTC ISO string in the given timezone. */
export function getMinutesFromMidnight(iso: string, tz: string): number {
  const { hour, minute } = getHourMinuteInTz(iso, tz);
  return hour * 60 + minute;
}

/** Formats a UTC ISO string as "9:00 AM" in the given timezone. */
export function formatTimeInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

/** Formats a UTC ISO string as "Mon Apr 7" in the given timezone. */
export function formatDateInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

/** Formats a Date as "Mon Apr 7" using the given timezone. */
export function formatDayInTz(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

/** Returns the day-of-month number (1-31) for a Date in the given timezone. */
export function getDayOfMonthInTz(date: Date, tz: string): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "numeric" }).format(date),
    10,
  );
}

/** Returns the weekday abbreviation ("Mon", "Tue" …) for a Date in the given timezone. */
export function getWeekdayInTz(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(date);
}

/**
 * Returns true if a UTC ISO string falls on the same calendar day
 * as `date` when both are viewed in the given timezone.
 */
export function isSameDayInTz(iso: string, date: Date, tz: string): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const aptParts = fmt.formatToParts(new Date(iso));
  const dateParts = fmt.formatToParts(date);
  const get = (parts: Intl.DateTimeFormatPart[], type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return (
    get(aptParts, "year") === get(dateParts, "year") &&
    get(aptParts, "month") === get(dateParts, "month") &&
    get(aptParts, "day") === get(dateParts, "day")
  );
}

/** Returns true if `date` is today (compared in the given timezone). */
export function isTodayInTz(date: Date, tz: string): boolean {
  return isSameDayInTz(new Date().toISOString(), date, tz);
}

// ── Appointment layout (overlap detection) ─────────────────────────────────

/**
 * Computes absolute positioning for a list of appointments on a single day.
 *
 * Algorithm (O(n²)):
 *  1. Compute startMinutes / endMinutes for each appointment in business tz.
 *  2. Sort by startMinutes.
 *  3. Sweep to build overlap clusters: a cluster is a maximal group where
 *     every pair of members has overlapping time ranges.
 *  4. Within each cluster of N members, assign columnIndex 0..N-1 by
 *     start-time order. Each card gets left=(idx/N) and width=(1/N).
 */
export function computeLayout(
  appointments: GHLAppointment[],
  tz: string,
): LayoutAppointment[] {
  if (appointments.length === 0) return [];

  // Step 1: annotate with pixel positions
  type Ann = GHLAppointment & { startMin: number; endMin: number };
  const annotated: Ann[] = appointments.map((apt) => {
    const startMin = getMinutesFromMidnight(apt.startTime, tz);
    const rawEnd = getMinutesFromMidnight(apt.endTime, tz);
    // If endMin <= startMin (crosses midnight or zero-duration) show at least 30 min
    const endMin = rawEnd <= startMin ? startMin + 30 : rawEnd;
    return { ...apt, startMin, endMin };
  });

  // Step 2: sort by start time
  annotated.sort((a, b) => a.startMin - b.startMin);

  // Step 3: build clusters using sweep
  const clusters: Ann[][] = [];

  for (const apt of annotated) {
    // Find the first cluster this appointment overlaps with
    let placed = false;
    for (const cluster of clusters) {
      // overlaps any member?
      const overlaps = cluster.some(
        (c) => apt.startMin < c.endMin && apt.endMin > c.startMin,
      );
      if (overlaps) {
        cluster.push(apt);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([apt]);
  }

  // Merge clusters that share overlapping members (handles A-B-C chains)
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const iMembers = clusters[i];
        const jMembers = clusters[j];
        // Any cross-cluster overlap?
        const cross = iMembers.some((a) =>
          jMembers.some(
            (b) => a.startMin < b.endMin && a.endMin > b.startMin,
          ),
        );
        if (cross) {
          clusters[i] = [...iMembers, ...jMembers];
          clusters.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }

  // Step 4: assign columns within each cluster
  const result: LayoutAppointment[] = [];
  for (const cluster of clusters) {
    // Sort cluster members by start time (already sorted globally, but cluster may be unsorted)
    cluster.sort((a, b) => a.startMin - b.startMin);
    const n = cluster.length;
    cluster.forEach((apt, idx) => {
      result.push({
        ...apt,
        top: apt.startMin,
        height: Math.max(apt.endMin - apt.startMin, 15), // min 15px
        left: idx / n,
        width: 1 / n,
      });
    });
  }

  return result;
}

// ── Status colors ──────────────────────────────────────────────────────────

export interface StatusStyle {
  bg: string;
  border: string;
  text: string;
  strikethrough: boolean;
}

export function getStatusStyle(status: GHLAppointmentStatus): StatusStyle {
  switch (status) {
    case "confirmed":
    case "showed":
      return {
        bg: "bg-teal-50",
        border: "border-teal-500",
        text: "text-teal-900",
        strikethrough: false,
      };
    case "cancelled":
      return {
        bg: "bg-gray-50",
        border: "border-gray-400",
        text: "text-gray-400",
        strikethrough: true,
      };
    default:
      // noshow, invalid, or any unconfirmed status
      return {
        bg: "bg-amber-50",
        border: "border-amber-500",
        text: "text-amber-900",
        strikethrough: false,
      };
  }
}

/** Returns true when the appointment should show the Recipe 7 reminder badge. */
export function showReminderBadge(
  status: GHLAppointmentStatus,
  reminderActive: boolean,
): boolean {
  return (
    reminderActive &&
    status !== "confirmed" &&
    status !== "cancelled" &&
    status !== "showed"
  );
}

// ── Week range helpers ─────────────────────────────────────────────────────

/** Returns ISO date strings for the start (Monday 00:00) and end (Sunday 23:59:59) of a week. */
export function getWeekRange(weekStart: Date): { startDate: string; endDate: string } {
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  const end = addDays(start, 6);
  end.setHours(23, 59, 59, 999);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

/** Returns ISO date strings for the start and end of a single day. */
export function getDayRange(date: Date): { startDate: string; endDate: string } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

/**
 * Formats a week range as "Mar 31 – Apr 6, 2026".
 * Year is always appended to the end date.
 */
export function formatWeekRange(start: Date, end: Date): string {
  const startFmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(start);
  const endFmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(end);
  return `${startFmt} – ${endFmt}`;
}
