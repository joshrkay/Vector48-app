import crypto from "node:crypto";
import type {
  AutomationEventInsert,
  GHLWebhookPayload,
} from "./webhookTypes";

const SUPPORTED_EVENT_TYPES: Record<string, AutomationEventInsert["event_type"]> = {
  CallCompleted: "call_completed",
  InboundMessage: "message_received",
  ContactCreate: "contact_created",
  ContactUpdate: "contact_updated",
  OpportunityCreate: "opportunity_created",
  OpportunityStageUpdate: "opportunity_moved",
  AppointmentCreate: "appointment_created",
  AppointmentStatusUpdate: "appointment_updated",
  ConversationUnreadUpdate: "conversation_unread",
  ConversationUnread: "conversation_unread",
  NoteCreate: "note_created",
  TagUpdate: "tag_updated",
};

const SECRET_KEYS = new Set([
  "token",
  "verificationToken",
  "webhookToken",
  "access_token",
  "refresh_token",
  "apiKey",
  "api_key",
]);

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SECRET_KEYS.has(key))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, sanitizeValue(entry)]),
    );
  }

  return value;
}

function sanitizePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return sanitizeValue(value) as Record<string, unknown>;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(obj[key]);
    if (value) return value;
  }
  return null;
}

function getContactRecord(payload: Record<string, unknown>): Record<string, unknown> {
  return typeof payload.contact === "object" && payload.contact !== null
    ? (payload.contact as Record<string, unknown>)
    : {};
}

function formatContactName(payload: Record<string, unknown>): string | null {
  const contact = getContactRecord(payload);

  const fromContactFull = pickString(contact, ["contactName", "name"]);
  if (fromContactFull) return fromContactFull;

  const contactFirst = pickString(contact, ["firstName"]);
  const contactLast = pickString(contact, ["lastName"]);
  if (contactFirst && contactLast) return `${contactFirst} ${contactLast}`;
  if (contactFirst ?? contactLast) return contactFirst ?? contactLast;

  const full = pickString(payload, ["contactName", "name"]);
  if (full) return full;

  const first = pickString(payload, ["firstName"]);
  const last = pickString(payload, ["lastName"]);
  if (first && last) return `${first} ${last}`;
  return first ?? last;
}

function formatPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return phone;
}

function formatDateTime(raw: unknown): string | null {
  const value = asString(raw);
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatStatus(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/[_-]+/g, " ").trim().toLowerCase();
  return normalized.length > 0 ? normalized[0].toUpperCase() + normalized.slice(1) : null;
}

function formatDurationMinutes(payload: Record<string, unknown>): string | null {
  const duration = asNumber(payload.callDuration) ?? asNumber(payload.duration);
  if (duration === null) return null;

  const minutes = duration >= 60 ? Math.max(1, Math.round(duration / 60)) : Math.max(1, Math.round(duration));
  return `${minutes} min`;
}

function formatDirection(payload: Record<string, unknown>): string | null {
  const direction = pickString(payload, ["callDirection", "direction"]);
  return direction ? direction.toLowerCase() : null;
}

function messagePreview(payload: Record<string, unknown>): string | null {
  const preview = pickString(payload, ["body", "message"]);
  if (!preview) return null;

  const normalized = preview.replace(/\s+/g, " ").trim();
  if (normalized.length <= 60) return normalized;
  return `${normalized.slice(0, 57)}...`;
}

function extractContactId(payload: Record<string, unknown>, ghlEventType: string): string | null {
  const contact = getContactRecord(payload);
  const explicitContactId = pickString(payload, ["contactId", "contact_id"]) ?? pickString(contact, ["id"]);
  if (explicitContactId) return explicitContactId;

  if (ghlEventType === "ContactCreate" || ghlEventType === "ContactUpdate") {
    return pickString(payload, ["id"]);
  }

  return null;
}

function extractContactPhone(payload: Record<string, unknown>): string | null {
  const contact = getContactRecord(payload);
  return formatPhone(pickString(payload, ["phone"]) ?? pickString(contact, ["phone"]));
}

function extractEntityId(payload: Record<string, unknown>, ghlEventType: string): string | null {
  switch (ghlEventType) {
    case "CallCompleted":
      return pickString(payload, ["callId", "id"]);
    case "InboundMessage":
    case "ConversationUnread":
    case "ConversationUnreadUpdate":
      return pickString(payload, ["conversationId", "id"]);
    case "ContactCreate":
    case "ContactUpdate":
      return pickString(payload, ["contactId", "contact_id", "id"]);
    case "OpportunityCreate":
    case "OpportunityStageUpdate":
      return pickString(payload, ["opportunityId", "opportunity_id", "id"]);
    case "AppointmentCreate":
    case "AppointmentStatusUpdate":
      return pickString(payload, ["appointmentId", "appointment_id", "id"]);
    case "NoteCreate":
      return pickString(payload, ["noteId", "note_id", "id"]);
    case "TagUpdate":
      return pickString(payload, ["contactId", "contact_id", "id"]);
    default:
      return pickString(payload, ["id"]);
  }
}

function extractEventTimestamp(payload: Record<string, unknown>): string | null {
  return pickString(payload, ["timestamp", "dateUpdated", "updatedAt", "dateAdded", "createdAt"]);
}

function extractGhlEventId(
  payload: Record<string, unknown>,
  ghlEventType: string,
  sanitizedPayload: Record<string, unknown>,
): string | null {
  const explicitId = pickString(payload, ["webhookId", "eventId"]);
  if (explicitId) return `${ghlEventType}:${explicitId}`;

  const entityId = extractEntityId(payload, ghlEventType);
  const timestamp = extractEventTimestamp(payload);
  if (entityId && timestamp) {
    return `${ghlEventType}:${entityId}:${timestamp}`;
  }

  const digest = crypto
    .createHash("sha256")
    .update(stableStringify(sanitizedPayload))
    .digest("hex")
    .slice(0, 20);

  return `${ghlEventType}:${digest}`;
}

function summaryForEvent(ghlEventType: string, payload: Record<string, unknown>): string {
  const contactName = formatContactName(payload);
  const phone = extractContactPhone(payload);
  const who = contactName ?? phone ?? "contact";
  const opportunityName = pickString(payload, ["opportunityName", "name"]) ?? "opportunity";
  const stageName =
    pickString(payload, ["stageName", "pipelineStage", "currentStage"]) ?? "Updated";
  const when = formatDateTime(payload.startTime ?? payload.start_time ?? payload.appointmentTime);
  const appointmentStatus = formatStatus(
    pickString(payload, ["appointmentStatus", "status"]),
  );

  switch (ghlEventType) {
    case "CallCompleted": {
      const duration = formatDurationMinutes(payload);
      const direction = formatDirection(payload);
      const parts = [duration, direction].filter(Boolean).join(", ");
      return parts.length > 0
        ? `Call completed with ${who} — ${parts}`
        : `Call completed with ${who}`;
    }
    case "InboundMessage": {
      const preview = messagePreview(payload);
      return preview ? `New message from ${who} — "${preview}"` : `New message from ${who}`;
    }
    case "ContactCreate":
      return contactName && phone ? `New contact: ${contactName}, ${phone}` : `New contact: ${who}`;
    case "ContactUpdate":
      return contactName && phone ? `Contact updated: ${contactName}, ${phone}` : `Contact updated: ${who}`;
    case "OpportunityCreate":
      return `Opportunity created: ${opportunityName}${contactName ? ` for ${contactName}` : ""}`;
    case "OpportunityStageUpdate":
      return `Lead moved to '${stageName}' stage — ${opportunityName}${contactName ? ` for ${contactName}` : ""}`;
    case "AppointmentCreate":
      return when ? `Appointment created: ${who}, ${when}` : `Appointment created: ${who}`;
    case "AppointmentStatusUpdate":
      return when && appointmentStatus
        ? `Appointment ${appointmentStatus.toLowerCase()}: ${who}, ${when}`
        : appointmentStatus
          ? `Appointment ${appointmentStatus.toLowerCase()}: ${who}`
          : `Appointment updated: ${who}`;
    case "ConversationUnread":
    case "ConversationUnreadUpdate":
      return `Conversation has unread messages from ${who}`;
    case "NoteCreate": {
      const preview = messagePreview(payload);
      return preview ? `Note added for ${who} — "${preview}"` : `Note added for ${who}`;
    }
    case "TagUpdate": {
      const added = Array.isArray(payload.addedTags)
        ? (payload.addedTags as unknown[]).filter((t): t is string => typeof t === "string")
        : [];
      if (added.length > 0) {
        return `Tag added for ${who}: ${added.join(", ")}`;
      }
      return `Tags updated for ${who}`;
    }
    default:
      return "Customer activity received";
  }
}

export function parseGHLWebhook(
  rawPayload: GHLWebhookPayload | Record<string, unknown>,
  ghlEventType: string,
): Omit<AutomationEventInsert, "account_id"> | null {
  const payload = rawPayload as Record<string, unknown>;
  const sanitizedPayload = sanitizePayload(payload);
  const eventType = SUPPORTED_EVENT_TYPES[ghlEventType];

  if (!eventType) {
    return null;
  }

  return {
    recipe_slug: null,
    event_type: eventType,
    ghl_event_type: ghlEventType,
    ghl_event_id: extractGhlEventId(payload, ghlEventType, sanitizedPayload),
    contact_id: extractContactId(payload, ghlEventType),
    contact_phone: extractContactPhone(payload),
    contact_name: formatContactName(payload),
    summary: summaryForEvent(ghlEventType, payload),
    detail: sanitizedPayload,
  };
}
