import type {
  AutomationEventInsert,
  GHLWebhookPayload,
} from "./webhookTypes";

const EVENT_TYPE_MAP: Record<string, AutomationEventInsert["event_type"]> = {
  CallCompleted: "call_completed",
  InboundMessage: "message_received",
  ContactCreate: "contact_created",
  ContactUpdate: "contact_updated",
  OpportunityCreate: "opportunity_created",
  OpportunityStageUpdate: "opportunity_moved",
  AppointmentCreate: "appointment_created",
  AppointmentStatusUpdate: "appointment_updated",
  ConversationUnreadUpdate: "conversation_unread",
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(obj[key]);
    if (value) return value;
  }
  return null;
}

function formatContactName(payload: Record<string, unknown>): string | null {
  const contact =
    typeof payload.contact === "object" && payload.contact !== null
      ? (payload.contact as Record<string, unknown>)
      : null;

  const full = pickString(payload, ["contactName", "name"]) ?? pickString(contact ?? {}, ["name"]);
  if (full) return full;

  const first = pickString(payload, ["firstName"]) ?? pickString(contact ?? {}, ["firstName"]);
  const last = pickString(payload, ["lastName"]) ?? pickString(contact ?? {}, ["lastName"]);

  if (first && last) return `${first} ${last}`;
  return first;
}

function formatPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function previewText(text: string | null, max = 42): string | null {
  if (!text) return null;
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

function formatCallDuration(rawSeconds: unknown): string {
  const seconds = asNumber(rawSeconds);
  if (seconds === null || seconds < 0) return "unknown duration";
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins} min`;
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
  });
}

function extractContactId(payload: Record<string, unknown>, ghlEventType: string): string | null {
  if (ghlEventType === "ContactCreate" || ghlEventType === "ContactUpdate") {
    return pickString(payload, ["id", "contactId", "contact_id"]);
  }

  const contact =
    typeof payload.contact === "object" && payload.contact !== null
      ? (payload.contact as Record<string, unknown>)
      : {};

  return pickString(payload, ["contactId", "contact_id"]) ?? pickString(contact, ["id"]);
}

function extractGhlEventId(payload: Record<string, unknown>, ghlEventType: string): string | null {
  const explicitId = pickString(payload, ["webhookId", "eventId", "id"]);
  if (explicitId) return `${ghlEventType}:${explicitId}`;

  const fallbackEntity = pickString(payload, ["contactId", "contact_id", "conversationId", "appointmentId", "opportunityId"]);
  const fallbackTime = pickString(payload, ["dateUpdated", "dateAdded", "timestamp", "updatedAt", "createdAt"]);

  if (fallbackEntity && fallbackTime) {
    return `${ghlEventType}:${fallbackEntity}:${fallbackTime}`;
  }

  return fallbackEntity ? `${ghlEventType}:${fallbackEntity}` : null;
}

function summaryForEvent(ghlEventType: string, payload: Record<string, unknown>): string {
  const contactName = formatContactName(payload);
  const contact =
    typeof payload.contact === "object" && payload.contact !== null
      ? (payload.contact as Record<string, unknown>)
      : {};
  const phone = formatPhone(pickString(payload, ["phone"]) ?? pickString(contact, ["phone"]));

  switch (ghlEventType) {
    case "CallCompleted": {
      const name = contactName ?? phone ?? "unknown contact";
      const duration = formatCallDuration(payload.callDuration ?? payload.duration);
      const direction = (pickString(payload, ["callDirection", "direction"]) ?? "unknown").toLowerCase();
      return `Call completed with ${name} — ${duration}, ${direction}`;
    }
    case "InboundMessage": {
      const from = contactName ?? phone ?? "unknown number";
      const body = previewText(pickString(payload, ["body", "message"]));
      return body ? `New message from ${from} — '${body}'` : `New message from ${from}`;
    }
    case "ContactCreate": {
      const who = contactName ?? "New contact";
      return phone ? `New contact: ${who}, ${phone}` : `New contact: ${who}`;
    }
    case "ContactUpdate": {
      const who = contactName ?? "contact";
      return `Contact updated: ${who}`;
    }
    case "OpportunityCreate": {
      const opp = pickString(payload, ["name"]) ?? "opportunity";
      return `New opportunity: ${opp}`;
    }
    case "OpportunityStageUpdate": {
      const stage = pickString(payload, ["currentStage", "pipelineStage", "stageName"]) ?? "unknown stage";
      const opp = pickString(payload, ["name"]) ?? "opportunity";
      const lead = contactName ? ` for ${contactName}` : "";
      return `Lead moved to '${stage}' stage — ${opp}${lead}`;
    }
    case "AppointmentCreate": {
      const who = contactName ?? "contact";
      const at = formatDateTime(payload.startTime ?? payload.start_time ?? payload.appointmentTime);
      return at ? `Appointment booked: ${who}, ${at}` : `Appointment booked: ${who}`;
    }
    case "AppointmentStatusUpdate": {
      const who = contactName ?? "contact";
      const status = (pickString(payload, ["status", "appointmentStatus"]) ?? "updated").toLowerCase();
      const at = formatDateTime(payload.startTime ?? payload.start_time ?? payload.appointmentTime);
      return at ? `Appointment ${status}: ${who}, ${at}` : `Appointment ${status}: ${who}`;
    }
    case "ConversationUnreadUpdate": {
      const count = asNumber(payload.unreadCount) ?? 0;
      const label = count === 1 ? "message" : "messages";
      const who = contactName ?? phone ?? "contact";
      return `${count} unread ${label} from ${who}`;
    }
    default:
      return "Customer activity received";
  }
}

export function parseGHLWebhook(
  rawPayload: GHLWebhookPayload | Record<string, unknown>,
  ghlEventType: string,
): Omit<AutomationEventInsert, "account_id"> {
  const payload = rawPayload as Record<string, unknown>;

  const contact =
    typeof payload.contact === "object" && payload.contact !== null
      ? (payload.contact as Record<string, unknown>)
      : {};

  const contactPhone = formatPhone(
    pickString(payload, ["phone"]) ?? pickString(contact, ["phone"]),
  );

  const contactName = formatContactName(payload);

  return {
    recipe_slug: null,
    event_type: EVENT_TYPE_MAP[ghlEventType] ?? "ghl_event",
    ghl_event_type: ghlEventType,
    ghl_event_id: extractGhlEventId(payload, ghlEventType),
    contact_id: extractContactId(payload, ghlEventType),
    contact_phone: contactPhone,
    contact_name: contactName,
    summary: summaryForEvent(ghlEventType, payload),
    detail: payload,
  };
}
