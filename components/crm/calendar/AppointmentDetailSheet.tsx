"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { formatTimeInTz, formatDateInTz, getStatusStyle, showReminderBadge } from "@/lib/crm/calendar-utils";
import type { GHLAppointment } from "@/lib/ghl/types";

interface Props {
  appointment: GHLAppointment | null;
  timezone: string;
  reminderActive: boolean;
  onClose: () => void;
  onUpdated: (updated: GHLAppointment) => void;
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  showed: "Showed",
  noshow: "No Show",
  invalid: "Invalid",
};

export function AppointmentDetailSheet({
  appointment,
  timezone,
  reminderActive,
  onClose,
  onUpdated,
}: Props) {
  const [loading, setLoading] = useState<"confirm" | "cancel" | "reminder" | null>(null);

  if (!appointment) return null;

  const style = getStatusStyle(appointment.status);
  const showBadge = showReminderBadge(appointment.status, reminderActive);

  async function handleConfirm() {
    if (!appointment) return;
    setLoading("confirm");
    try {
      const res = await fetch(`/api/ghl/appointments/${appointment.id}/confirm`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success("Appointment confirmed");
      onUpdated(data.event ?? { ...appointment, status: "confirmed" });
    } catch {
      toast.error("Failed to confirm appointment");
    } finally {
      setLoading(null);
    }
  }

  async function handleCancel() {
    if (!appointment) return;
    setLoading("cancel");
    try {
      const res = await fetch(`/api/ghl/appointments/${appointment.id}/cancel`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success("Appointment cancelled");
      onUpdated(data.event ?? { ...appointment, status: "cancelled" });
    } catch {
      toast.error("Failed to cancel appointment");
    } finally {
      setLoading(null);
    }
  }

  async function handleSendReminder() {
    if (!appointment) return;
    setLoading("reminder");
    try {
      const res = await fetch("/api/recipes/manual-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipeSlug: "appointment-reminder",
          contactId: appointment.contactId,
          appointmentId: appointment.id,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Reminder sent");
    } catch {
      toast.error("Failed to send reminder");
    } finally {
      setLoading(null);
    }
  }

  const dateLabel = formatDateInTz(appointment.startTime, timezone);
  const startLabel = formatTimeInTz(appointment.startTime, timezone);
  const endLabel = formatTimeInTz(appointment.endTime, timezone);

  return (
    <Sheet open={!!appointment} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b p-6 pb-4">
          <SheetTitle className="text-base font-semibold">
            {appointment.title ?? "Appointment"}
          </SheetTitle>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={[
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                style.bg,
                style.text,
              ].join(" ")}
            >
              {STATUS_LABELS[appointment.status] ?? appointment.status}
            </span>
            {showBadge && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Reminder active
              </span>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Date & time */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              Date &amp; Time
            </p>
            <p className="mt-1 text-sm">
              {dateLabel} · {startLabel} – {endLabel}
            </p>
          </div>

          {/* Contact */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              Contact
            </p>
            <Link
              href={`/crm/contacts/${appointment.contactId}`}
              className="mt-1 block text-sm text-brand-primary hover:underline"
              onClick={onClose}
            >
              View contact →
            </Link>
          </div>

          {/* Notes */}
          {appointment.notes && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                Notes
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{appointment.notes}</p>
            </div>
          )}
        </div>

        <SheetFooter className="flex flex-col gap-2 border-t p-6 pt-4">
          {appointment.status !== "confirmed" && appointment.status !== "cancelled" && (
            <Button
              onClick={handleConfirm}
              disabled={loading !== null}
              className="w-full"
            >
              {loading === "confirm" ? "Confirming…" : "Confirm Appointment"}
            </Button>
          )}

          {showBadge && (
            <Button
              variant="outline"
              onClick={handleSendReminder}
              disabled={loading !== null}
              className="w-full"
            >
              {loading === "reminder" ? "Sending…" : "Send Manual Reminder"}
            </Button>
          )}

          {appointment.status !== "cancelled" && (
            <Button
              variant="outline"
              onClick={() => toast.info("Reschedule coming soon")}
              disabled={loading !== null}
              className="w-full"
            >
              Reschedule
            </Button>
          )}

          {appointment.status !== "cancelled" && (
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={loading !== null}
              className="w-full text-destructive hover:text-destructive"
            >
              {loading === "cancel" ? "Cancelling…" : "Cancel Appointment"}
            </Button>
          )}

          <Button variant="ghost" onClick={onClose} className="w-full">
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
