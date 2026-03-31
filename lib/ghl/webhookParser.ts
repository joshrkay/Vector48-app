// ---------------------------------------------------------------------------
// GHL Webhook Parser — Pure function that normalizes raw GHL webhook payloads
// into AutomationEventInsert objects for the automation_events table.
// ---------------------------------------------------------------------------

import type { AutomationEventInsert } from "./webhookTypes";

// ── Event type mapping ────────────────────────────────────────────────────

const EVENT_TYPE_MAP: Record<string, string> = {
  ContactCreate: "contact_created",
  ContactUpdate: "contact_updated",
  CallCompleted: "call_completed",
  InboundMessage: "message_received",
  OpportunityCreate: "opportunity_created",
  OpportunityStageUpdate: "opportunity_moved",
  AppointmentCreate: "appointment_created",
  AppointmentStatusUpdate: "appointment_updated",
  ConversationUnreadUpdate: "conversation_unread",
};

// ── Helpers (private) ─────────────────────────────────────────────────────

function str(val: unknown): string | undefined {
  return typeof val === "string" && val.length > 0 ? val : undefined;
}

function num(val: unknown): number | undefined {
  return typeof val === "number" ? val : undefined;
}

function nestedStr(obj: unknown, ...keys: string[]): string | undefined {
  let current: unknown = obj;
  for (const key of keys) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return str(current);
}

function formatContactName(payload: Record<string, unknown>): string {
  const contact =
    typeof payload.contact === "object" && payload.contact !== null
      ? (payload.contact as Record<string, unknown>)
      : null;

  const firstName =
    str(payload.firstName) ?? str(contact?.firstName) ?? undefined;
  const lastName = str(payload.lastName) ?? str(contact?.lastName) ?? undefined;
  const fullName =
    str(payload.name) ?? str(contact?.name) ?? str(payload.contactName);

  if (firstName && lastName) {
    return `${firstName} ${lastName.charAt(0)}.`;
  }
  if (firstName) return firstName;
  if (fullName) return fullName;
  return "Unknown contact";
}

function formatDuration(seconds: unknown): string {
  const s = num(seconds);
  if (s == null) return "unknown duration";
  if (s < 60) return `${s} sec`;
  const minutes = Math.round(s / 60);
  return `${minutes} min`;
}

function truncate(text: string, maxLen: number = 60): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

function formatDateTime(raw: unknown): string {
  const s = str(raw);
  if (!s) return "date TBD";
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return "date TBD";
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "date TBD";
  }
}

// ── Contact ID extraction ─────────────────────────────────────────────────

function extractContactId(
  payload: Record<string, unknown>,
  ghlEventType: string
): string | null {
  // For contact events, the payload IS the contact — `id` is the contact ID
  if (ghlEventType === "ContactCreate" || ghlEventType === "ContactUpdate") {
    return str(payload.id) ?? str(payload.contactId) ?? null;
  }

  const contact =
    typeof payload.contact === "object" && payload.contact !== null
      ? (payload.contact as Record<string, unknown>)
      : null;

  return (
    str(payload.contactId) ??
    str(payload.contact_id) ??
    str(contact?.id) ??
    null
  );
}

// ── GHL event ID for idempotency ──────────────────────────────────────────

function extractEventId(
  payload: Record<string, unknown>,
  ghlEventType: string
): string | null {
  const entityId =
    str(payload.id) ??
    str(payload.appointmentId) ??
    str(payload.opportunityId) ??
    str(payload.conversationId);

  if (!entityId) return null;

  // Include a timestamp when available so legitimate re-fires of the same
  // event type for the same entity aren't silently dropped as duplicates.
  // E.g., two ContactUpdate webhooks for the same contact with different
  // dateUpdated values are distinct events that should both be recorded.
  const timestamp =
    str(payload.dateUpdated) ??
    str(payload.dateAdded) ??
    str(payload.timestamp);

  if (timestamp) {
    return `${ghlEventType}:${entityId}:${timestamp}`;
  }
  // Composite key ensures uniqueness across event types for the same entity
  return `${ghlEventType}:${entityId}`;
}

// ── Summary builders per event type ───────────────────────────────────────

function buildSummary(
  payload: Record<string, unknown>,
  ghlEventType: string
): string {
  switch (ghlEventType) {
    case "ContactCreate": {
      const name = formatContactName(payload);
      const identifier = str(payload.phone) ?? str(payload.email) ?? "";
      return identifier
        ? `New contact: ${name}, ${identifier}`
        : `New contact: ${name}`;
    }

    case "ContactUpdate": {
      const name = formatContactName(payload);
      return `Contact updated: ${name}`;
    }

    case "CallCompleted": {
      const name = formatContactName(payload);
      const duration = formatDuration(
        payload.callDuration ?? payload.duration
      );
      const direction = str(payload.callDirection) ?? str(payload.direction) ?? "unknown";
      return `Call completed with ${name} — ${duration}, ${direction}`;
    }

    case "InboundMessage": {
      const name = formatContactName(payload);
      const body = str(payload.body) ?? str(payload.message) ?? "";
      return body
        ? `New message from ${name}: ${truncate(body)}`
        : `New message from ${name}`;
    }

    case "OpportunityCreate": {
      const oppName = str(payload.name) ?? "Untitled opportunity";
      const value = num(payload.monetaryValue);
      const valuePart = value != null ? ` — $${value.toLocaleString()}` : "";
      return `New opportunity: ${oppName}${valuePart}`;
    }

    case "OpportunityStageUpdate": {
      const stageName =
        str(payload.currentStage) ??
        str(payload.pipelineStage) ??
        str(payload.stageName) ??
        nestedStr(payload, "pipeline", "stage", "name") ??
        "unknown stage";
      const oppName = str(payload.name) ?? "opportunity";
      const contactName = formatContactName(payload);
      return `Lead moved to '${stageName}' stage — ${oppName} for ${contactName}`;
    }

    case "AppointmentCreate": {
      const name = formatContactName(payload);
      const dateStr = formatDateTime(
        payload.startTime ?? payload.start_time ?? payload.appointmentTime
      );
      return `Appointment booked: ${name}, ${dateStr}`;
    }

    case "AppointmentStatusUpdate": {
      const name = formatContactName(payload);
      const status =
        str(payload.status) ?? str(payload.appointmentStatus) ?? "updated";
      const dateStr = formatDateTime(
        payload.startTime ?? payload.start_time ?? payload.appointmentTime
      );
      return `Appointment ${status}: ${name}, ${dateStr}`;
    }

    case "ConversationUnreadUpdate": {
      const count = num(payload.unreadCount) ?? 0;
      const name = formatContactName(payload);
      const plural = count === 1 ? "message" : "messages";
      return `${count} unread ${plural} from ${name}`;
    }

    default:
      return `Activity recorded: ${ghlEventType}`;
  }
}

// ── Main parser ───────────────────────────────────────────────────────────

/**
 * Parses a raw GHL webhook payload into a normalized event for automation_events.
 * This is a pure function — it does not touch the database or network.
 *
 * @param rawPayload - The raw JSON body from the GHL webhook
 * @param ghlEventType - The GHL event type string (e.g. "ContactCreate")
 * @returns An AutomationEventInsert (minus account_id, which is added by the route)
 */
export function parseGHLWebhook(
  rawPayload: Record<string, unknown>,
  ghlEventType: string
): Omit<AutomationEventInsert, "account_id"> {
  const eventType = EVENT_TYPE_MAP[ghlEventType] ?? "ghl_event";
  const contactId = extractContactId(rawPayload, ghlEventType);
  const ghlEventId = extractEventId(rawPayload, ghlEventType);
  const summary = buildSummary(rawPayload, ghlEventType);

  const contact =
    typeof rawPayload.contact === "object" && rawPayload.contact !== null
      ? (rawPayload.contact as Record<string, unknown>)
      : null;
  const contactPhone =
    str(rawPayload.phone) ?? str(contact?.phone) ?? null;
  const contactName = formatContactName(rawPayload);

  return {
    recipe_slug: null,
    event_type: eventType,
    ghl_event_type: ghlEventType,
    contact_id: contactId,
    contact_phone: contactPhone,
    contact_name: contactName !== "Unknown contact" ? contactName : null,
    ghl_event_id: ghlEventId,
    summary,
    detail: rawPayload,
  };
}
