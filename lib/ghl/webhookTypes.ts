// ---------------------------------------------------------------------------
// GoHighLevel Webhook Payload Types
// Each GHL event type sends a different payload shape. These types represent
// the inbound webhook data, NOT the API response types (those live in types.ts).
// ---------------------------------------------------------------------------

// ── Base fields present (inconsistently) across all GHL webhooks ──────────

export interface GHLWebhookBase {
  /** GHL event type — may arrive as `type` or `event` */
  type?: string;
  event?: string;
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
// Flag: `callDuration` may be number (seconds) or absent.
//       `direction` vs `callDirection` varies.

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
// Flag: Stage info may be `pipelineStage`, `stageName`, `currentStage`,
//       or nested under `pipeline.stage.name`.

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
// Flag: Date fields may be `startTime`, `start_time`, or `appointmentTime`.

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

// ── Normalized event shape written to event_log ───────────────────────────

export interface AutomationEventInsert {
  account_id: string;
  recipe_slug: string | null;
  event_type: string;
  ghl_event_type: string;
  contact_id: string | null;
  ghl_event_id: string | null;
  summary: string;
  detail: Record<string, unknown>;
}
