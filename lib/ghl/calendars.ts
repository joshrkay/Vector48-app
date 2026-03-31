// ---------------------------------------------------------------------------
// GoHighLevel API v2 — Calendar / Appointments Service
// Docs: https://marketplace.gohighlevel.com/docs/
// ---------------------------------------------------------------------------

import { ghlGet, ghlPost, ghlPut, ghlDelete, type GHLClientOptions } from "./client";
import type {
  GHLCalendarsListResponse,
  GHLCalendar,
  GHLCalendarSlotsParams,
  GHLCalendarSlotsResponse,
  GHLAppointmentsListParams,
  GHLAppointmentsListResponse,
  GHLAppointment,
  GHLCreateAppointmentPayload,
  GHLUpdateAppointmentPayload,
} from "./types";

// ── Calendars ──────────────────────────────────────────────────────────────

export function getCalendars(opts?: GHLClientOptions) {
  return ghlGet<GHLCalendarsListResponse>("/calendars/", opts);
}

export function getCalendar(calendarId: string, opts?: GHLClientOptions) {
  return ghlGet<{ calendar: GHLCalendar }>(`/calendars/${calendarId}`, opts);
}

// ── Available slots ────────────────────────────────────────────────────────

export function getCalendarSlots(
  params: GHLCalendarSlotsParams,
  opts?: GHLClientOptions,
) {
  const { calendarId, ...rest } = params;
  return ghlGet<GHLCalendarSlotsResponse>(
    `/calendars/${calendarId}/free-slots`,
    {
      ...opts,
      params: rest as Record<string, string | number | boolean | undefined>,
    },
  );
}

// ── Appointments ───────────────────────────────────────────────────────────

export function getAppointments(
  params?: GHLAppointmentsListParams,
  opts?: GHLClientOptions,
) {
  const { locationId, ...rest } = params ?? {};
  return ghlGet<GHLAppointmentsListResponse>("/calendars/events", {
    ...opts,
    locationId: locationId ?? opts?.locationId,
    params: rest as Record<string, string | number | boolean | undefined>,
  });
}

export function getAppointment(
  eventId: string,
  opts?: GHLClientOptions,
) {
  return ghlGet<{ event: GHLAppointment }>(
    `/calendars/events/${eventId}`,
    opts,
  );
}

export function createAppointment(
  data: GHLCreateAppointmentPayload,
  opts?: GHLClientOptions,
) {
  return ghlPost<{ event: GHLAppointment }>(
    "/calendars/events",
    data,
    opts,
  );
}

export function updateAppointment(
  eventId: string,
  data: GHLUpdateAppointmentPayload,
  opts?: GHLClientOptions,
) {
  return ghlPut<{ event: GHLAppointment }>(
    `/calendars/events/${eventId}`,
    data,
    opts,
  );
}

export function deleteAppointment(
  eventId: string,
  opts?: GHLClientOptions,
) {
  return ghlDelete(`/calendars/events/${eventId}`, opts);
}
