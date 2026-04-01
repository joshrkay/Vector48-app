// ---------------------------------------------------------------------------
// GHL Webhook Parser — Pure function that normalizes raw GHL webhook payloads
// into AutomationEventInsert objects for the automation_events table.
// ---------------------------------------------------------------------------

import type {
  AutomationEventInsert,
  GHLWebhookAppointmentCreate,
  GHLWebhookAppointmentStatusUpdate,
  GHLWebhookBase,
  GHLWebhookCallCompleted,
  GHLWebhookContactCreate,
  GHLWebhookContactUpdate,
  GHLWebhookConversationUnreadUpdate,
  GHLWebhookInboundMessage,
  GHLWebhookOpportunityCreate,
  GHLWebhookOpportunityStageUpdate,
} from "./webhookTypes";
import { normalizeGHLEventType } from "./webhookTypes";

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

function formatDuration(seconds: unknown): string {
  const s = num(seconds);
  if (s == null) return "unknown duration";
  if (s < 60) return `${s} sec`;
  const minutes = Math.round(s / 60);
  return `${minutes} min`;
}

function truncate(text: string, maxLen: number = 60): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function formatDateTime(raw: unknown): string {
  const s = str(raw);
  if (!s) return "date TBD";
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "date TBD";
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

function formatContactName(payload: Record<string, unknown>): string {
  const contact =
    typeof payload.contact === "object" && payload.contact !== null
      ? (payload.contact as Record<string, unknown>)
      : null;

  const firstName = str(payload.firstName) ?? str(contact?.firstName);
  const lastName = str(payload.lastName) ?? str(contact?.lastName);
  const fullName = str(payload.name) ?? str(contact?.name) ?? str(payload.contactName);

  if (firstName && lastName) {
    return `${firstName} ${lastName.charAt(0)}.`;
  }
  return firstName ?? fullName ?? "Unknown contact";
}

function extractContactId(payload: Record<string, unknown>, ghlEventType: string): string | null {
  if (ghlEventType === "ContactCreate" || ghlEventType === "ContactUpdate") {
    return str(payload.id) ?? str(payload.contactId) ?? null;
  }

  const contact =
    typeof payload.contact === "object" && payload.contact !== null
      ? (payload.contact as Record<string, unknown>)
      : null;

  return str(payload.contactId) ?? str(payload.contact_id) ?? str(contact?.id) ?? null;
}

function extractEventId(payload: Record<string, unknown>, ghlEventType: string): string | null {
  const entityId =
    str(payload.id) ?? str(payload.appointmentId) ?? str(payload.opportunityId) ?? str(payload.conversationId);

  if (!entityId) return null;

  const timestamp = str(payload.dateUpdated) ?? str(payload.dateAdded) ?? str(payload.timestamp);
  if (timestamp) {
    return `${ghlEventType}:${entityId}:${timestamp}`;
  }
  return `${ghlEventType}:${entityId}`;
}

function sanitizeDetail(payload: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set(["token", "webhooktoken", "verificationtoken", "signature", "x-ghl-signature"]);

  const sanitizeValue = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item));
    }
    if (typeof value === "object" && value !== null) {
      const obj = value as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const [key, nestedValue] of Object.entries(obj)) {
        if (blocked.has(key.toLowerCase())) continue;
        if (nestedValue === undefined) continue;
        result[key] = sanitizeValue(nestedValue);
      }
      return result;
    }
    return value;
  };

  return sanitizeValue(payload) as Record<string, unknown>;
}

type EventParseResult = {
  summary: string;
  detail: Record<string, unknown>;
};

function parseContactCreated(payload: GHLWebhookContactCreate): EventParseResult {
  const cast = payload as Record<string, unknown>;
  const name = formatContactName(cast);
  const identifier = str(payload.phone) ?? str(payload.email) ?? "";
  return {
    summary: identifier ? `New contact: ${name}, ${identifier}` : `New contact: ${name}`,
    detail: sanitizeDetail(cast),
  };
}

function parseContactUpdated(payload: GHLWebhookContactUpdate): EventParseResult {
  const cast = payload as Record<string, unknown>;
  return {
    summary: `Contact updated: ${formatContactName(cast)}`,
    detail: sanitizeDetail(cast),
  };
}

function parseCallCompleted(payload: GHLWebhookCallCompleted): EventParseResult {
  const cast = payload as Record<string, unknown>;
  const duration = formatDuration(payload.callDuration ?? payload.duration);
  const direction = str(payload.callDirection) ?? str(payload.direction) ?? "unknown";
  return {
    summary: `Call completed with ${formatContactName(cast)} — ${duration}, ${direction}`,
    detail: sanitizeDetail(cast),
  };
}

function parseInboundMessage(payload: GHLWebhookInboundMessage): EventParseResult {
  const cast = payload as Record<string, unknown>;
  const body = str(payload.body) ?? str(payload.message) ?? "";
  return {
    summary: body
      ? `New message from ${formatContactName(cast)}: ${truncate(body)}`
      : `New message from ${formatContactName(cast)}`,
    detail: sanitizeDetail(cast),
  };
}

function parseOpportunityCreated(payload: GHLWebhookOpportunityCreate): EventParseResult {
  const cast = payload as Record<string, unknown>;
  const oppName = str(payload.name) ?? "Untitled opportunity";
  const value = num(payload.monetaryValue);
  return {
    summary: value != null ? `New opportunity: ${oppName} — $${value.toLocaleString()}` : `New opportunity: ${oppName}`,
    detail: sanitizeDetail(cast),
  };
}

function parseOpportunityMoved(payload: GHLWebhookOpportunityStageUpdate): EventParseResult {
  const cast = payload as Record<string, unknown>;
  const stageName =
    str(payload.currentStage) ??
    str(payload.pipelineStage) ??
    str(payload.stageName) ??
    nestedStr(payload, "pipeline", "stage", "name") ??
    "unknown stage";

  return {
    summary: `Lead moved to '${stageName}' stage — ${str(payload.name) ?? "opportunity"} for ${formatContactName(cast)}`,
    detail: sanitizeDetail(cast),
  };
}

function parseAppointmentCreated(payload: GHLWebhookAppointmentCreate): EventParseResult {
  const cast = payload as Record<string, unknown>;
  const when = formatDateTime(payload.startTime ?? payload.start_time ?? payload.appointmentTime);
  return {
    summary: `Appointment booked: ${formatContactName(cast)}, ${when}`,
    detail: sanitizeDetail(cast),
  };
}

function parseAppointmentUpdated(payload: GHLWebhookAppointmentStatusUpdate): EventParseResult {
  const cast = payload as Record<string, unknown>;
  const status = str(payload.status) ?? str(payload.appointmentStatus) ?? "updated";
  const when = formatDateTime(payload.startTime ?? payload.start_time ?? payload.appointmentTime);
  return {
    summary: `Appointment ${status}: ${formatContactName(cast)}, ${when}`,
    detail: sanitizeDetail(cast),
  };
}

function parseConversationUnread(payload: GHLWebhookConversationUnreadUpdate): EventParseResult {
  const cast = payload as Record<string, unknown>;
  const count = num(payload.unreadCount) ?? 0;
  return {
    summary: `${count} unread ${count === 1 ? "message" : "messages"} from ${formatContactName(cast)}`,
    detail: sanitizeDetail(cast),
  };
}

function parseUnknown(payload: GHLWebhookBase, ghlEventType: string): EventParseResult {
  return {
    summary: `Activity recorded: ${ghlEventType}`,
    detail: sanitizeDetail(payload as Record<string, unknown>),
  };
}

export function parseGHLWebhook(
  rawPayload: Record<string, unknown>,
  ghlEventType: string
): Omit<AutomationEventInsert, "account_id"> {
  const eventType = normalizeGHLEventType(ghlEventType);
  const contactId = extractContactId(rawPayload, ghlEventType);
  const ghlEventId = extractEventId(rawPayload, ghlEventType);

  const contact =
    typeof rawPayload.contact === "object" && rawPayload.contact !== null
      ? (rawPayload.contact as Record<string, unknown>)
      : null;

  const contactPhone = str(rawPayload.phone) ?? str(contact?.phone) ?? null;
  const contactName = formatContactName(rawPayload);

  const parsed = (() => {
    switch (eventType) {
      case "contact_created":
        return parseContactCreated(rawPayload as GHLWebhookContactCreate);
      case "contact_updated":
        return parseContactUpdated(rawPayload as GHLWebhookContactUpdate);
      case "call_completed":
        return parseCallCompleted(rawPayload as GHLWebhookCallCompleted);
      case "message_received":
        return parseInboundMessage(rawPayload as GHLWebhookInboundMessage);
      case "opportunity_created":
        return parseOpportunityCreated(rawPayload as GHLWebhookOpportunityCreate);
      case "opportunity_moved":
        return parseOpportunityMoved(rawPayload as GHLWebhookOpportunityStageUpdate);
      case "appointment_created":
        return parseAppointmentCreated(rawPayload as GHLWebhookAppointmentCreate);
      case "appointment_updated":
        return parseAppointmentUpdated(rawPayload as GHLWebhookAppointmentStatusUpdate);
      case "conversation_unread":
        return parseConversationUnread(rawPayload as GHLWebhookConversationUnreadUpdate);
      default:
        return parseUnknown(rawPayload as GHLWebhookBase, ghlEventType);
    }
  })();

  return {
    recipe_slug: null,
    event_type: eventType,
    ghl_event_type: ghlEventType,
    contact_id: contactId,
    contact_phone: contactPhone,
    contact_name: contactName !== "Unknown contact" ? contactName : null,
    ghl_event_id: ghlEventId,
    summary: parsed.summary,
    detail: parsed.detail,
  };
}
