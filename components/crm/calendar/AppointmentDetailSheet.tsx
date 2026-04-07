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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTimeInTz, formatDateInTz, getStatusStyle, showReminderBadge } from "@/lib/crm/calendar-utils";
import type { GHLAppointment } from "@/lib/ghl/types";

const DURATION_OPTIONS = [
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "90", label: "1.5 hours" },
  { value: "120", label: "2 hours" },
];

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
  const [loading, setLoading] = useState<"confirm" | "cancel" | "reminder" | "reschedule" | null>(null);
  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleDuration, setRescheduleDuration] = useState("60");

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

  function enterRescheduleMode() {
    const start = new Date(appointment!.startTime);
    const end = new Date(appointment!.endTime);
    const diffMinutes = Math.round((end.getTime() - start.getTime()) / 60_000);
    const y = start.getFullYear();
    const m = String(start.getMonth() + 1).padStart(2, "0");
    const d = String(start.getDate()).padStart(2, "0");
    const hh = String(start.getHours()).padStart(2, "0");
    const mm = String(start.getMinutes()).padStart(2, "0");

    setRescheduleDate(`${y}-${m}-${d}`);
    setRescheduleTime(`${hh}:${mm}`);
    setRescheduleDuration(
      DURATION_OPTIONS.find((o) => o.value === String(diffMinutes))
        ? String(diffMinutes)
        : "60",
    );
    setRescheduleMode(true);
  }

  async function handleReschedule() {
    if (!appointment || !rescheduleDate || !rescheduleTime) return;
    setLoading("reschedule");
    try {
      const startDate = new Date(`${rescheduleDate}T${rescheduleTime}:00`);
      const endDate = new Date(startDate.getTime() + parseInt(rescheduleDuration) * 60_000);

      const res = await fetch(`/api/ghl/appointments/${appointment.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success("Appointment rescheduled");
      setRescheduleMode(false);
      onUpdated(data.event ?? { ...appointment, startTime: startDate.toISOString(), endTime: endDate.toISOString() });
    } catch {
      toast.error("Failed to reschedule appointment");
    } finally {
      setLoading(null);
    }
  }

  const dateLabel = formatDateInTz(appointment.startTime, timezone);
  const startLabel = formatTimeInTz(appointment.startTime, timezone);
  const endLabel = formatTimeInTz(appointment.endTime, timezone);

  return (
    <Sheet open={!!appointment} onOpenChange={(open) => { if (!open) { setRescheduleMode(false); onClose(); } }}>
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

          {/* Reschedule form */}
          {rescheduleMode && (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
                Reschedule
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="reschedule-date">Date</Label>
                <Input
                  id="reschedule-date"
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reschedule-time">Start Time</Label>
                <Input
                  id="reschedule-time"
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Duration</Label>
                <Select value={rescheduleDuration} onValueChange={setRescheduleDuration}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleReschedule}
                  disabled={loading !== null || !rescheduleDate || !rescheduleTime}
                  className="flex-1"
                >
                  {loading === "reschedule" ? "Saving…" : "Confirm New Time"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRescheduleMode(false)}
                  disabled={loading !== null}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
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

          {appointment.status !== "cancelled" && !rescheduleMode && (
            <Button
              variant="outline"
              onClick={enterRescheduleMode}
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
