"use client";

import { formatTimeInTz, getStatusStyle, showReminderBadge } from "@/lib/crm/calendar-utils";
import type { LayoutAppointment } from "@/lib/crm/calendar-utils";

interface Props {
  appointment: LayoutAppointment;
  timezone: string;
  reminderActive: boolean;
  onClick: (apt: LayoutAppointment) => void;
}

export function AppointmentCard({ appointment, timezone, reminderActive, onClick }: Props) {
  const style = getStatusStyle(appointment.status);
  const showBadge = showReminderBadge(appointment.status, reminderActive);

  const startLabel = formatTimeInTz(appointment.startTime, timezone);
  const endLabel = formatTimeInTz(appointment.endTime, timezone);

  return (
    <button
      onClick={() => onClick(appointment)}
      className={[
        "absolute left-0 overflow-hidden rounded border-l-2 px-1 py-0.5 text-left text-xs leading-tight transition-opacity hover:opacity-90",
        style.bg,
        style.border,
        style.text,
        style.strikethrough ? "line-through opacity-60" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        top: appointment.top,
        height: Math.max(appointment.height, 15),
        left: `${appointment.left * 100}%`,
        width: `calc(${appointment.width * 100}% - 2px)`,
        minHeight: 15,
      }}
      title={`${appointment.title ?? "Appointment"} · ${startLabel}–${endLabel}`}
    >
      <div className="truncate font-medium">{appointment.title ?? "Appointment"}</div>
      {appointment.height >= 30 && (
        <div className="truncate opacity-75">
          {startLabel}–{endLabel}
        </div>
      )}
      {showBadge && appointment.height >= 40 && (
        <span className="mt-0.5 inline-block rounded bg-amber-200 px-1 py-0.5 text-[10px] font-medium text-amber-800">
          Reminder active
        </span>
      )}
    </button>
  );
}
