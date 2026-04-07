"use client";

import { type FormEvent, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetDescription,
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
import { SlotPicker } from "@/components/crm/calendar/SlotPicker";
import type { GHLCalendar, GHLCalendarSlot } from "@/lib/ghl/types";
import type { CRMContactSearchItem, CRMContactSearchResponse } from "@/lib/crm/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendars: GHLCalendar[];
  onCreated: () => void;
}

const DURATION_OPTIONS = [
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "90", label: "1.5 hours" },
  { value: "120", label: "2 hours" },
];

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function AddAppointmentSheet({ open, onOpenChange, calendars, onCreated }: Props) {
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<CRMContactSearchItem[]>([]);
  const [selectedContact, setSelectedContact] = useState<CRMContactSearchItem | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [calendarId, setCalendarId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState("60");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(contactQuery, 300);

  // Reset form when sheet opens
  useEffect(() => {
    if (open) {
      setContactQuery("");
      setSelectedContact(null);
      setContactResults([]);
      setCalendarId(calendars[0]?.id ?? "");
      // Default to today
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, "0");
      const d = String(today.getDate()).padStart(2, "0");
      setDate(`${y}-${m}-${d}`);
      setTime("09:00");
      setDuration("60");
      setNotes("");
    }
  }, [open, calendars]);

  // Search contacts when query changes
  useEffect(() => {
    if (!open || debouncedQuery.length < 2) {
      setContactResults([]);
      setShowDropdown(false);
      return;
    }
    if (selectedContact && debouncedQuery === selectedContact.name) return;

    const controller = new AbortController();
    fetch(`/api/ghl/contacts/search?q=${encodeURIComponent(debouncedQuery)}`, {
      signal: controller.signal,
    })
      .then((r) => r.json() as Promise<CRMContactSearchResponse>)
      .then((data) => {
        setContactResults(data.contacts ?? []);
        setShowDropdown(true);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [debouncedQuery, open, selectedContact]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectContact(contact: CRMContactSearchItem) {
    setSelectedContact(contact);
    setContactQuery(contact.name);
    setShowDropdown(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedContact) {
      toast.error("Please select a contact");
      return;
    }
    if (!calendarId) {
      toast.error("Please select a calendar");
      return;
    }
    if (!date || !time) {
      toast.error("Please set a date and time");
      return;
    }

    const startDate = new Date(`${date}T${time}:00`);
    const endDate = new Date(startDate.getTime() + parseInt(duration) * 60 * 1000);

    setSubmitting(true);
    try {
      const res = await fetch("/api/ghl/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarId,
          contactId: selectedContact.id,
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
          notes: notes || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Appointment scheduled");
      onOpenChange(false);
      onCreated();
    } catch {
      toast.error("Failed to schedule appointment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b p-6 pb-4">
          <SheetTitle>Schedule Appointment</SheetTitle>
          <SheetDescription>
            Search for a contact and pick a time slot.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex-1 space-y-4 p-6">
            {/* Contact search */}
            <div className="space-y-1.5" ref={dropdownRef}>
              <Label htmlFor="contact-search">Contact</Label>
              <div className="relative">
                <Input
                  id="contact-search"
                  placeholder="Search by name, email, or phone…"
                  value={contactQuery}
                  onChange={(e) => {
                    setContactQuery(e.target.value);
                    if (selectedContact && e.target.value !== selectedContact.name) {
                      setSelectedContact(null);
                    }
                  }}
                  autoComplete="off"
                />
                {showDropdown && contactResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-md border bg-bg-primary shadow-lg">
                    {contactResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-bg-secondary"
                        onClick={() => selectContact(c)}
                      >
                        <span className="font-medium">{c.name}</span>
                        {(c.email || c.phone) && (
                          <span className="text-xs text-text-secondary">
                            {c.email ?? c.phone}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {showDropdown && contactResults.length === 0 && debouncedQuery.length >= 2 && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-bg-primary p-3 text-sm text-text-secondary shadow-lg">
                    No contacts found
                  </div>
                )}
              </div>
            </div>

            {/* Calendar */}
            {calendars.length > 0 && (
              <div className="space-y-1.5">
                <Label>Calendar</Label>
                <Select value={calendarId} onValueChange={setCalendarId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select calendar" />
                  </SelectTrigger>
                  <SelectContent>
                    {calendars.map((cal) => (
                      <SelectItem key={cal.id} value={cal.id}>
                        {cal.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Available slots */}
            {calendarId && (
              <div className="space-y-1.5">
                <Label>Available Slots</Label>
                <SlotPicker
                  calendarId={calendarId}
                  selectedSlot={null}
                  onSelectSlot={(slot: GHLCalendarSlot) => {
                    const start = new Date(slot.startTime);
                    const end = new Date(slot.endTime);
                    const y = start.getFullYear();
                    const m = String(start.getMonth() + 1).padStart(2, "0");
                    const d = String(start.getDate()).padStart(2, "0");
                    const hh = String(start.getHours()).padStart(2, "0");
                    const mm = String(start.getMinutes()).padStart(2, "0");
                    setDate(`${y}-${m}-${d}`);
                    setTime(`${hh}:${mm}`);
                    const diffMinutes = Math.round((end.getTime() - start.getTime()) / 60_000);
                    if ([30, 60, 90, 120].includes(diffMinutes)) {
                      setDuration(String(diffMinutes));
                    }
                  }}
                />
              </div>
            )}

            {/* Date */}
            <div className="space-y-1.5">
              <Label htmlFor="apt-date">Date</Label>
              <Input
                id="apt-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            {/* Time */}
            <div className="space-y-1.5">
              <Label htmlFor="apt-time">Start Time</Label>
              <Input
                id="apt-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>

            {/* Duration */}
            <div className="space-y-1.5">
              <Label>Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
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

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="apt-notes">Notes (optional)</Label>
              <textarea
                id="apt-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes…"
                className="w-full resize-none rounded-md border border-input bg-bg-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <SheetFooter className="border-t p-6 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? "Scheduling…" : "Schedule"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
