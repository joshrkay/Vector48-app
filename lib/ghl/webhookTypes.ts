// ---------------------------------------------------------------------------
// GoHighLevel Webhook Payload Types
// Each GHL event type sends a different payload shape. These types represent
// the inbound webhook data, NOT the API response types (those live in types.ts).
// ---------------------------------------------------------------------------

export const GHL_EVENT_TYPE_MAP = {
  ContactCreate: "contact_created",
  ContactUpdate: "contact_updated",
  CallCompleted: "call_completed",
  InboundMessage: "message_received",
  OpportunityCreate: "opportunity_created",
  OpportunityStageUpdate: "opportunity_moved",
  AppointmentCreate: "appointment_created",
  AppointmentStatusUpdate: "appointment_updated",
  ConversationUnreadUpdate: "conversation_unread",
} as const;

export type GHLRawEventType = keyof typeof GHL_EVENT_TYPE_MAP;
export type GHLNormalizedEventType = (typeof GHL_EVENT_TYPE_MAP)[GHLRawEventType];
export type GHLNormalizedEventTypeOrUnknown = GHLNormalizedEventType | "ghl_event";

export function normalizeGHLEventType(rawType?: string | null): GHLNormalizedEventTypeOrUnknown {
  if (!rawType) return "ghl_event";
  return GHL_EVENT_TYPE_MAP[rawType as GHLRawEventType] ?? "ghl_event";
}

// ── Base fields present (inconsistently) across all GHL webhooks ──────────

export interface GHLWebhookBase {
  /** GHL event type — may arrive as `type` or `event` */
  type?: string;
  event?: string;
  /** Verification fields occasionally included in webhook body */
  token?: string;
  webhookToken?: string;
  verificationToken?: string;
  /** Location/sub-account ID — casing varies between events */
  locationId?: string;
  location_id?: string;
  /** Entity ID — semantics differ per event type */
  id?: string;
}

// ── Nested contact shape (partial — GHL doesn't always send all fields) ──

export interface GHLWebhookContactRef {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

// ── ContactCreate / ContactUpdate ─────────────────────────────────────────

export interface GHLWebhookContactCreate extends GHLWebhookBase {
  type?: "ContactCreate";
  /** For contact events, `id` is the contact ID itself */
  id?: string;
  contactId?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  source?: string;
  tags?: string[];
  dateAdded?: string;
  customFields?: Array<{ id: string; fieldValue: unknown }>;
}

export interface GHLWebhookContactUpdate extends GHLWebhookBase {
  type?: "ContactUpdate";
  id?: string;
  contactId?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  source?: string;
  tags?: string[];
  dateUpdated?: string;
}

// ── CallCompleted ─────────────────────────────────────────────────────────

export interface GHLWebhookCallCompleted extends GHLWebhookBase {
  type?: "CallCompleted";
  id?: string;
  contactId?: string;
  contact_id?: string;
  contact?: GHLWebhookContactRef;
  callDuration?: number;
  duration?: number;
  callDirection?: string;
  direction?: string;
  callStatus?: string;
  status?: string;
  callerNumber?: string;
  calledNumber?: string;
  recordingUrl?: string;
  notes?: string;
  transcription?: string;
}

// ── InboundMessage ────────────────────────────────────────────────────────

export interface GHLWebhookInboundMessage extends GHLWebhookBase {
  type?: "InboundMessage";
  id?: string;
  contactId?: string;
  contact_id?: string;
  contact?: GHLWebhookContactRef;
  body?: string;
  message?: string;
  messageType?: string;
  conversationId?: string;
  dateAdded?: string;
  attachments?: string[];
}

// ── OpportunityCreate ─────────────────────────────────────────────────────

export interface GHLWebhookOpportunityCreate extends GHLWebhookBase {
  type?: "OpportunityCreate";
  id?: string;
  opportunityId?: string;
  name?: string;
  monetaryValue?: number;
  pipelineId?: string;
  pipelineStageId?: string;
  stageName?: string;
  status?: string;
  contactId?: string;
  contact_id?: string;
  contact?: GHLWebhookContactRef;
}

// ── OpportunityStageUpdate ────────────────────────────────────────────────

export interface GHLWebhookOpportunityStageUpdate extends GHLWebhookBase {
  type?: "OpportunityStageUpdate";
  id?: string;
  opportunityId?: string;
  name?: string;
  monetaryValue?: number;
  pipelineId?: string;
  pipelineStageId?: string;
  previousStage?: string;
  currentStage?: string;
  pipelineStage?: string;
  stageName?: string;
  status?: string;
  contactId?: string;
  contact_id?: string;
  contact?: GHLWebhookContactRef;
  pipeline?: {
    stage?: {
      name?: string;
    };
  };
}

// ── AppointmentCreate ─────────────────────────────────────────────────────

export interface GHLWebhookAppointmentCreate extends GHLWebhookBase {
  type?: "AppointmentCreate";
  id?: string;
  appointmentId?: string;
  contactId?: string;
  contact_id?: string;
  contact?: GHLWebhookContactRef;
  title?: string;
  calendarId?: string;
  startTime?: string;
  start_time?: string;
  appointmentTime?: string;
  endTime?: string;
  end_time?: string;
  status?: string;
  appointmentStatus?: string;
}

// ── AppointmentStatusUpdate ───────────────────────────────────────────────

export interface GHLWebhookAppointmentStatusUpdate extends GHLWebhookBase {
  type?: "AppointmentStatusUpdate";
  id?: string;
  appointmentId?: string;
  contactId?: string;
  contact_id?: string;
  contact?: GHLWebhookContactRef;
  title?: string;
  calendarId?: string;
  startTime?: string;
  start_time?: string;
  appointmentTime?: string;
  endTime?: string;
  end_time?: string;
  status?: string;
  appointmentStatus?: string;
}

// ── ConversationUnreadUpdate ──────────────────────────────────────────────

export interface GHLWebhookConversationUnreadUpdate extends GHLWebhookBase {
  type?: "ConversationUnreadUpdate";
  contactId?: string;
  contact_id?: string;
  contact?: GHLWebhookContactRef;
  conversationId?: string;
  unreadCount?: number;
}

// ── Union type ────────────────────────────────────────────────────────────

export type GHLWebhookPayload =
  | GHLWebhookContactCreate
  | GHLWebhookContactUpdate
  | GHLWebhookCallCompleted
  | GHLWebhookInboundMessage
  | GHLWebhookOpportunityCreate
  | GHLWebhookOpportunityStageUpdate
  | GHLWebhookAppointmentCreate
  | GHLWebhookAppointmentStatusUpdate
  | GHLWebhookConversationUnreadUpdate;

export type GHLWebhookDiscriminatedPayload =
  | { normalizedType: "contact_created"; payload: GHLWebhookContactCreate }
  | { normalizedType: "contact_updated"; payload: GHLWebhookContactUpdate }
  | { normalizedType: "call_completed"; payload: GHLWebhookCallCompleted }
  | { normalizedType: "message_received"; payload: GHLWebhookInboundMessage }
  | { normalizedType: "opportunity_created"; payload: GHLWebhookOpportunityCreate }
  | { normalizedType: "opportunity_moved"; payload: GHLWebhookOpportunityStageUpdate }
  | { normalizedType: "appointment_created"; payload: GHLWebhookAppointmentCreate }
  | { normalizedType: "appointment_updated"; payload: GHLWebhookAppointmentStatusUpdate }
  | { normalizedType: "conversation_unread"; payload: GHLWebhookConversationUnreadUpdate }
  | { normalizedType: "ghl_event"; payload: GHLWebhookBase & Record<string, unknown> };

// ── Normalized event shape written to automation_events ───────────────────

export interface AutomationEventInsert {
  account_id: string;
  recipe_slug: string | null;
  event_type: string;
  ghl_event_type: string;
  contact_id: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  ghl_event_id: string | null;
  summary: string;
  detail: Record<string, unknown>;
}
