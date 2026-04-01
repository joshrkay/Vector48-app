import type {
  AutomationEventInsert,
  GHLWebhookPayload,
} from "./webhookTypes";

const SUPPORTED_EVENT_TYPES: Record<string, AutomationEventInsert["event_type"]> = {
  ContactCreate: "lead_created",
  ConversationUnread: "lead_outreach_sent",
  ConversationUnreadUpdate: "lead_outreach_sent",
  AppointmentCreate: "appointment_confirmed",
  AppointmentStatusUpdate: "alert",
  OpportunityCreate: "lead_created",
};

const SECRET_KEYS = new Set(["token", "verificationToken", "webhookToken"]);

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function sanitizePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SECRET_KEYS.has(key))
      .map(([key, entry]) => [key, sanitizeValue(entry)]),
  );
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SECRET_KEYS.has(key))
        .map(([key, entry]) => [key, sanitizeValue(entry)]),
    );
  }

  return value;
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

function isCancelledStatus(payload: Record<string, unknown>): boolean {
  const status = pickString(payload, ["status", "appointmentStatus"]);
  return status?.toLowerCase() === "cancelled";
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
    case "ContactCreate": {
      const who = contactName ?? phone ?? "contact";
      return `New contact ${who} added`;
    }
    case "OpportunityCreate": {
      const name = pickString(payload, ["name"]) ?? contactName ?? "opportunity";
      return `New opportunity: ${name}`;
    }
    case "AppointmentCreate": {
      const who = contactName ?? phone ?? "contact";
      const at = formatDateTime(payload.startTime ?? payload.start_time ?? payload.appointmentTime);
      return at ? `Appointment booked with ${who} for ${at}` : `Appointment booked with ${who}`;
    }
    case "AppointmentStatusUpdate": {
      const who = contactName ?? phone ?? "contact";
      return `Appointment cancelled by ${who}`;
    }
    case "ConversationUnread":
    case "ConversationUnreadUpdate": {
      const who = contactName ?? phone ?? "contact";
      return `Message received from ${who}`;
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

  if (ghlEventType === "AppointmentStatusUpdate" && !isCancelledStatus(payload)) {
    return null;
  }

  const contact =
    typeof payload.contact === "object" && payload.contact !== null
      ? (payload.contact as Record<string, unknown>)
      : {};

  const contactPhone = formatPhone(
    pickString(payload, ["phone"]) ?? pickString(contact, ["phone"]),
  );

  const contactName = formatContactName(payload);

  return {
    recipe_slug: "system",
    event_type: eventType,
    ghl_event_type: ghlEventType,
    ghl_event_id: extractGhlEventId(payload, ghlEventType),
    contact_id: extractContactId(payload, ghlEventType),
    contact_phone: contactPhone,
    contact_name: contactName,
    summary: summaryForEvent(ghlEventType, payload),
    detail: sanitizedPayload,
  };
}
