"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GHLContact, GHLCalendar } from "@/lib/ghl/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: GHLContact;
}

export function AddAppointmentSheet({ open, onOpenChange, contact }: Props) {
  const [calendars, setCalendars] = useState<GHLCalendar[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [saving, setSaving] = useState(false);

  const contactName =
    contact.name ||
    `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() ||
    "Contact";

  const [title, setTitle] = useState(`Appointment with ${contactName}`);
  const [calendarId, setCalendarId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");

  useEffect(() => {
    if (!open) return;
    setLoadingCalendars(true);
    fetch("/api/ghl/calendars")
      .then((r) => r.json())
      .then((data: { calendars?: GHLCalendar[] }) => {
        const list = data.calendars ?? [];
        setCalendars(list);
        if (list.length > 0 && !calendarId) {
          setCalendarId(list[0].id);
        }
      })
      .catch(() => toast.error("Could not load calendars"))
      .finally(() => setLoadingCalendars(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit() {
    if (!calendarId || !date || !time) {
      toast.error("Please fill in all fields");
      return;
    }

    const startTime = new Date(`${date}T${time}:00`);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // +1 hour

    setSaving(true);
    try {
      const res = await fetch("/api/ghl/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarId,
          contactId: contact.id,
          title: title.trim() || `Appointment with ${contactName}`,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Failed to create appointment");
      toast.success("Appointment scheduled");
      onOpenChange(false);
    } catch {
      toast.error("Failed to schedule appointment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Schedule Appointment</SheetTitle>
          <SheetDescription>Book an appointment with {contactName}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4 px-1">
          <div className="space-y-1.5">
            <Label htmlFor="appt-title">Title</Label>
            <Input
              id="appt-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Appointment title"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Calendar</Label>
            {loadingCalendars ? (
              <p className="text-sm text-[var(--text-secondary)]">Loading calendars…</p>
            ) : (
              <Select value={calendarId} onValueChange={setCalendarId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a calendar" />
                </SelectTrigger>
                <SelectContent>
                  {calendars.map((cal) => (
                    <SelectItem key={cal.id} value={cal.id}>
                      {cal.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="appt-date">Date</Label>
              <Input
                id="appt-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="appt-time">Time</Label>
              <Input
                id="appt-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || loadingCalendars}>
            {saving ? "Scheduling…" : "Schedule"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
