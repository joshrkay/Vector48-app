export type GHLWebhookEventType =
  | "CallCompleted"
  | "InboundMessage"
  | "ContactCreate"
  | "ContactUpdate"
  | "OpportunityCreate"
  | "OpportunityStageUpdate"
  | "AppointmentCreate"
  | "AppointmentStatusUpdate"
  | "ConversationUnreadUpdate"
  | "ConversationUnread";

export type AutomationEventType =
  | "call_completed"
  | "message_received"
  | "contact_created"
  | "contact_updated"
  | "opportunity_created"
  | "opportunity_moved"
  | "appointment_created"
  | "appointment_updated"
  | "conversation_unread"
  | "sequence_paused"
  | "rebook_triggered"
  | "alert";

export interface GHLWebhookBase {
  type?: string;
  event?: string;
  locationId?: string;
  location_id?: string;
  id?: string;
  eventId?: string;
  webhookId?: string;
  dateAdded?: string;
  dateUpdated?: string;
  createdAt?: string;
  updatedAt?: string;
  timestamp?: string;
  verificationToken?: string;
  token?: string;
  webhookToken?: string;
}

export interface GHLWebhookContactRef {
  id?: string;
  name?: string;
  contactName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export interface GHLWebhookContactCreate extends GHLWebhookBase {
  type?: "ContactCreate";
  contactId?: string;
  contact_id?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  source?: string;
  tags?: string[];
  contact?: GHLWebhookContactRef;
}

export interface GHLWebhookContactUpdate extends GHLWebhookBase {
  type?: "ContactUpdate";
  contactId?: string;
  contact_id?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  source?: string;
  tags?: string[];
  contact?: GHLWebhookContactRef;
}

export interface GHLWebhookCallCompleted extends GHLWebhookBase {
  type?: "CallCompleted";
  contactId?: string;
  contact_id?: string;
  callId?: string;
  callDuration?: number;
  duration?: number;
  callDirection?: string;
  direction?: string;
  notes?: string;
  transcription?: string;
  summary?: string;
  contact?: GHLWebhookContactRef;
}

export interface GHLWebhookInboundMessage extends GHLWebhookBase {
  type?: "InboundMessage";
  contactId?: string;
  contact_id?: string;
  conversationId?: string;
  body?: string;
  message?: string;
  contact?: GHLWebhookContactRef;
}

export interface GHLWebhookOpportunityCreate extends GHLWebhookBase {
  type?: "OpportunityCreate";
  opportunityId?: string;
  opportunity_id?: string;
  name?: string;
  opportunityName?: string;
  monetaryValue?: number;
  stageName?: string;
  currentStage?: string;
  pipelineStage?: string;
  contactId?: string;
  contact_id?: string;
  contact?: GHLWebhookContactRef;
}

export interface GHLWebhookOpportunityStageUpdate extends GHLWebhookBase {
  type?: "OpportunityStageUpdate";
  opportunityId?: string;
  opportunity_id?: string;
  name?: string;
  opportunityName?: string;
  stageName?: string;
  currentStage?: string;
  pipelineStage?: string;
  contactId?: string;
  contact_id?: string;
  contact?: GHLWebhookContactRef;
}

export interface GHLWebhookAppointmentCreate extends GHLWebhookBase {
  type?: "AppointmentCreate";
  appointmentId?: string;
  appointment_id?: string;
  status?: string;
  appointmentStatus?: string;
  startTime?: string;
  start_time?: string;
  appointmentTime?: string;
  contactId?: string;
  contact_id?: string;
  contact?: GHLWebhookContactRef;
}

export interface GHLWebhookAppointmentStatusUpdate extends GHLWebhookBase {
  type?: "AppointmentStatusUpdate";
  appointmentId?: string;
  appointment_id?: string;
  status?: string;
  appointmentStatus?: string;
  startTime?: string;
  start_time?: string;
  appointmentTime?: string;
  contactId?: string;
  contact_id?: string;
  contact?: GHLWebhookContactRef;
}

export interface GHLWebhookConversationUnreadUpdate extends GHLWebhookBase {
  type?: "ConversationUnreadUpdate";
  conversationId?: string;
  unreadCount?: number;
  contactId?: string;
  contact_id?: string;
  contact?: GHLWebhookContactRef;
}

export interface GHLWebhookConversationUnread extends GHLWebhookBase {
  type?: "ConversationUnread";
  conversationId?: string;
  unreadCount?: number;
  contactId?: string;
  contact_id?: string;
  contact?: GHLWebhookContactRef;
}

export type GHLWebhookPayload =
  | GHLWebhookCallCompleted
  | GHLWebhookInboundMessage
  | GHLWebhookContactCreate
  | GHLWebhookContactUpdate
  | GHLWebhookOpportunityCreate
  | GHLWebhookOpportunityStageUpdate
  | GHLWebhookAppointmentCreate
  | GHLWebhookAppointmentStatusUpdate
  | GHLWebhookConversationUnreadUpdate
  | GHLWebhookConversationUnread;

export interface AutomationEventInsert {
  account_id: string;
  recipe_slug: string | null;
  event_type: AutomationEventType;
  ghl_event_type: string;
  ghl_event_id: string | null;
  contact_id: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  summary: string;
  detail: Record<string, unknown>;
}
