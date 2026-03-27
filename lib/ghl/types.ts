// ---------------------------------------------------------------------------
// GoHighLevel API v2 — Type Definitions
// Base URL: https://services.leadconnectorhq.com
// Docs: https://marketplace.gohighlevel.com/docs/
// ---------------------------------------------------------------------------

// ── Generic helpers ────────────────────────────────────────────────────────

export interface GHLPaginationMeta {
  total: number;
  count: number;
  currentPage: number;
  nextPage: number | null;
  prevPage: number | null;
}

export interface GHLListParams {
  limit?: number;
  offset?: number;
  locationId?: string;
}

// ── Contacts ───────────────────────────────────────────────────────────────

export interface GHLContact {
  id: string;
  locationId: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  website: string | null;
  source: string | null;
  tags: string[];
  customFields: GHLCustomFieldValue[];
  dateAdded: string;
  dateUpdated: string;
  dnd: boolean;
  type: string | null;
  assignedTo: string | null;
}

export interface GHLCustomFieldValue {
  id: string;
  fieldValue: string | string[] | number | boolean | null;
}

export interface GHLContactsListParams extends GHLListParams {
  query?: string;
  email?: string;
  phone?: string;
  tag?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface GHLContactsListResponse {
  contacts: GHLContact[];
  meta: GHLPaginationMeta;
}

export interface GHLContactResponse {
  contact: GHLContact;
}

export interface GHLCreateContactPayload {
  locationId: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  website?: string;
  source?: string;
  tags?: string[];
  customFields?: GHLCustomFieldValue[];
  dnd?: boolean;
  assignedTo?: string;
}

export interface GHLUpdateContactPayload
  extends Partial<Omit<GHLCreateContactPayload, "locationId">> {}

export interface GHLContactNote {
  id: string;
  body: string;
  contactId: string;
  userId: string | null;
  dateAdded: string;
}

export interface GHLContactTask {
  id: string;
  title: string;
  body: string | null;
  contactId: string;
  assignedTo: string | null;
  dueDate: string;
  completed: boolean;
  dateAdded: string;
}

// ── Conversations ──────────────────────────────────────────────────────────

export type GHLMessageType =
  | "TYPE_SMS"
  | "TYPE_EMAIL"
  | "TYPE_CALL"
  | "TYPE_LIVE_CHAT"
  | "TYPE_FACEBOOK"
  | "TYPE_INSTAGRAM"
  | "TYPE_WHATSAPP"
  | "TYPE_CUSTOM_SMS"
  | "TYPE_CUSTOM_EMAIL";

export interface GHLConversation {
  id: string;
  locationId: string;
  contactId: string;
  assignedTo: string | null;
  lastMessageBody: string | null;
  lastMessageDate: string | null;
  lastMessageType: GHLMessageType | null;
  lastMessageDirection: "inbound" | "outbound" | null;
  type: GHLMessageType;
  unreadCount: number;
  starred: boolean;
  dateAdded: string;
  dateUpdated: string;
}

export interface GHLConversationsListParams extends GHLListParams {
  contactId?: string;
  assignedTo?: string;
  sort?: "asc" | "desc";
  sortBy?: "last_message_date" | "date_added";
}

export interface GHLConversationsListResponse {
  conversations: GHLConversation[];
  total: number;
}

export interface GHLMessage {
  id: string;
  conversationId: string;
  locationId: string;
  contactId: string;
  body: string;
  type: GHLMessageType;
  direction: "inbound" | "outbound";
  status: "pending" | "delivered" | "read" | "failed" | "sent";
  contentType: string;
  dateAdded: string;
  attachments?: string[];
}

export interface GHLMessagesListParams {
  conversationId: string;
  limit?: number;
  lastMessageId?: string;
  type?: GHLMessageType;
}

export interface GHLMessagesListResponse {
  messages: GHLMessage[];
  lastMessageId: string | null;
}

export interface GHLSendMessagePayload {
  type: GHLMessageType;
  contactId: string;
  message?: string;
  subject?: string;
  html?: string;
  attachments?: string[];
  emailFrom?: string;
  emailTo?: string;
  emailCc?: string[];
  emailBcc?: string[];
}

export interface GHLCreateConversationPayload {
  locationId: string;
  contactId: string;
}

// ── Opportunities / Pipeline ───────────────────────────────────────────────

export interface GHLOpportunity {
  id: string;
  name: string;
  monetaryValue: number | null;
  pipelineId: string;
  pipelineStageId: string;
  assignedTo: string | null;
  status: "open" | "won" | "lost" | "abandoned";
  source: string | null;
  contactId: string;
  locationId: string;
  contact: Pick<GHLContact, "id" | "name" | "email" | "phone" | "tags"> | null;
  notes: string[];
  tags: string[];
  customFields: GHLCustomFieldValue[];
  dateAdded: string;
  dateUpdated: string;
  lastStatusChangeAt: string | null;
}

export interface GHLOpportunitiesListParams extends GHLListParams {
  pipelineId?: string;
  pipelineStageId?: string;
  status?: "open" | "won" | "lost" | "abandoned";
  assignedTo?: string;
  contactId?: string;
  query?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface GHLOpportunitiesListResponse {
  opportunities: GHLOpportunity[];
  meta: GHLPaginationMeta;
}

export interface GHLOpportunityResponse {
  opportunity: GHLOpportunity;
}

export interface GHLCreateOpportunityPayload {
  pipelineId: string;
  locationId: string;
  name: string;
  pipelineStageId: string;
  status?: "open" | "won" | "lost" | "abandoned";
  contactId: string;
  monetaryValue?: number;
  assignedTo?: string;
  source?: string;
  tags?: string[];
  customFields?: GHLCustomFieldValue[];
}

export interface GHLUpdateOpportunityPayload
  extends Partial<Omit<GHLCreateOpportunityPayload, "locationId">> {}

export interface GHLPipeline {
  id: string;
  name: string;
  locationId: string;
  stages: GHLPipelineStage[];
}

export interface GHLPipelineStage {
  id: string;
  name: string;
  position: number;
}

export interface GHLPipelinesListResponse {
  pipelines: GHLPipeline[];
}

// ── Calendar / Appointments ────────────────────────────────────────────────

export interface GHLCalendar {
  id: string;
  locationId: string;
  name: string;
  description: string | null;
  slug: string | null;
  widgetSlug: string | null;
  calendarType: "round_robin" | "event" | "class_booking" | "collective" | "service_booking";
  teamMembers: GHLCalendarTeamMember[];
  isActive: boolean;
  dateUpdated: string;
}

export interface GHLCalendarTeamMember {
  userId: string;
  priority: number;
  meetingLocationType: string | null;
  meetingLocation: string | null;
}

export interface GHLCalendarsListResponse {
  calendars: GHLCalendar[];
}

export interface GHLCalendarSlot {
  startTime: string;
  endTime: string;
}

export interface GHLCalendarSlotsParams {
  calendarId: string;
  startDate: string; // ISO 8601
  endDate: string;   // ISO 8601
  timezone?: string;
}

export interface GHLCalendarSlotsResponse {
  slots: Record<string, GHLCalendarSlot[]>; // keyed by date
}

export interface GHLAppointment {
  id: string;
  calendarId: string;
  locationId: string;
  contactId: string;
  title: string;
  status: "confirmed" | "cancelled" | "showed" | "noshow" | "invalid";
  assignedUserId: string | null;
  startTime: string;
  endTime: string;
  address: string | null;
  notes: string | null;
  dateAdded: string;
  dateUpdated: string;
}

export interface GHLAppointmentsListParams extends GHLListParams {
  calendarId?: string;
  contactId?: string;
  startDate?: string;
  endDate?: string;
  status?: GHLAppointment["status"];
}

export interface GHLAppointmentsListResponse {
  events: GHLAppointment[];
}

export interface GHLCreateAppointmentPayload {
  calendarId: string;
  locationId: string;
  contactId: string;
  title?: string;
  startTime: string;
  endTime: string;
  assignedUserId?: string;
  address?: string;
  notes?: string;
  status?: GHLAppointment["status"];
}

export interface GHLUpdateAppointmentPayload
  extends Partial<Omit<GHLCreateAppointmentPayload, "calendarId" | "locationId">> {}

// ── Locations ─────────────────────────────────────────────────────────────

export interface GHLCreateLocationPayload {
  companyId: string;
  name: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  timezone?: string;
  website?: string;
  email?: string;
}

export interface GHLLocation {
  id: string;
  companyId: string;
  name: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  timezone: string | null;
  website: string | null;
  email: string | null;
  apiKey: string;
  dateAdded: string;
}

export interface GHLCreateLocationResponse {
  location: GHLLocation;
}

export interface GHLUpdateLocationPayload {
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  timezone?: string;
  website?: string;
  email?: string;
  settings?: {
    businessName?: string;
    businessHours?: GHLBusinessHours[];
  };
}

export interface GHLBusinessHours {
  dayOfWeek: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
  isOpen: boolean;
}

// ── Webhooks ──────────────────────────────────────────────────────────────

export type GHLWebhookEvent =
  | "ContactCreate"
  | "ContactUpdate"
  | "ConversationUnreadUpdate"
  | "OpportunityCreate"
  | "OpportunityStageUpdate"
  | "AppointmentCreate"
  | "AppointmentStatusUpdate"
  | "InboundMessage"
  | "CallCompleted";

export interface GHLCreateWebhookPayload {
  locationId: string;
  url: string;
  events: GHLWebhookEvent[];
  secret?: string;
}

export interface GHLWebhook {
  id: string;
  locationId: string;
  url: string;
  events: string[];
  active: boolean;
  dateAdded: string;
}

export interface GHLWebhookResponse {
  webhook: GHLWebhook;
}

export interface GHLWebhooksListResponse {
  webhooks: GHLWebhook[];
}

// ── Error ──────────────────────────────────────────────────────────────────

export interface GHLErrorBody {
  statusCode: number;
  message: string;
  error?: string;
}
