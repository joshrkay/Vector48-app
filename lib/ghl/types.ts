// ---------------------------------------------------------------------------
// GoHighLevel API v2 — Type Definitions
// Base URL: https://services.leadconnectorhq.com
// Server-only types. Safe to import anywhere (no runtime side-effects).
// ---------------------------------------------------------------------------

// ── Generic Pagination ──────────────────────────────────────────────────────

/** Cursor-based pagination meta used by most GHL v2 list endpoints. */
export interface GHLPaginationMeta {
  total: number;
  count: number;
  currentPage: number;
  nextPage: number | null;
  prevPage: number | null;
}

/** Generic paginated wrapper. Some endpoints use startAfterId cursors. */
export interface GHLPaginatedResponse<T> {
  data: T[];
  meta: {
    startAfterId: string | null;
    total: number;
  };
}

export interface GHLListParams {
  limit?: number;
  startAfterId?: string;
  startAfter?: number;
  locationId?: string;
}

/** Normalized error shape returned from the client (not thrown). */
export interface GHLError {
  code: string;
  message: string;
  retryable: boolean;
}

// ── Contacts ────────────────────────────────────────────────────────────────

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
  followers: string[];
  attributions: { url: string; campaign: string | null; medium: string | null }[];
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

/**
 * Standalone custom field definition (from GET /locations/{id}/customFields).
 * Distinct from GHLCustomFieldValue which is a contact-level key-value pair.
 */
export interface GHLCustomField {
  id: string;
  name: string;
  fieldKey: string;
  dataType: string;
  placeholder: string | null;
  position: number;
  isMultipleFile: boolean;
}

export interface GHLContactsListParams extends GHLListParams {
  query?: string;
  email?: string;
  phone?: string;
  tag?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/** GHL v2 contacts list response */
export interface GHLContactsListResponse {
  contacts: GHLContact[];
  meta?: GHLPaginationMeta;
}

export interface GHLContactResponse {
  contact: GHLContact;
}

export interface GHLContactsSearchParams {
  locationId: string;
  query: string;
  limit?: number;
  filters?: Record<string, unknown>;
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

// ── Notes ───────────────────────────────────────────────────────────────────

export interface GHLNote {
  id: string;
  body: string;
  contactId: string;
  userId: string | null;
  dateAdded: string;
}

// ── Tags ────────────────────────────────────────────────────────────────────

export interface GHLTag {
  id: string;
  name: string;
  locationId: string;
}

// ── Conversations ───────────────────────────────────────────────────────────

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
  meta?: GHLPaginationMeta;
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
  limit?: number;
  lastMessageId?: string;
  type?: GHLMessageType;
}

export interface GHLMessagesListResponse {
  messages: GHLMessage[];
  traceId?: string;
}

export interface GHLSendMessagePayload {
  type: GHLMessageType;
  contactId: string;
  conversationId?: string;
  message?: string;
  subject?: string;
  html?: string;
  attachments?: string[];
  emailFrom?: string;
  emailTo?: string;
  emailCc?: string[];
  emailBcc?: string[];
}

// ── Opportunities / Pipeline ────────────────────────────────────────────────

export type GHLOpportunityStatus = "open" | "won" | "lost" | "abandoned";

export interface GHLOpportunity {
  id: string;
  name: string;
  monetaryValue: number | null;
  pipelineId: string;
  pipelineStageId: string;
  assignedTo: string | null;
  status: GHLOpportunityStatus;
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
  status?: GHLOpportunityStatus;
  assignedTo?: string;
  contactId?: string;
  query?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface GHLOpportunitiesListResponse {
  opportunities: GHLOpportunity[];
  meta?: GHLPaginationMeta;
}

export interface GHLOpportunityResponse {
  opportunity: GHLOpportunity;
}

export interface GHLCreateOpportunityPayload {
  pipelineId: string;
  locationId: string;
  name: string;
  pipelineStageId: string;
  status?: GHLOpportunityStatus;
  contactId: string;
  monetaryValue?: number;
  assignedTo?: string;
  source?: string;
  tags?: string[];
  customFields?: GHLCustomFieldValue[];
}

export interface GHLUpdateOpportunityPayload
  extends Partial<Omit<GHLCreateOpportunityPayload, "locationId">> {}

export interface GHLPipelineStage {
  id: string;
  name: string;
  position: number;
}

export interface GHLPipeline {
  id: string;
  name: string;
  locationId: string;
  stages: GHLPipelineStage[];
}

export interface GHLPipelinesListResponse {
  pipelines: GHLPipeline[];
}

// ── Calendar / Appointments ─────────────────────────────────────────────────

export interface GHLCalendarTeamMember {
  userId: string;
  priority: number;
  meetingLocationType: string | null;
  meetingLocation: string | null;
}

export type GHLAppointmentStatus =
  | "confirmed"
  | "cancelled"
  | "showed"
  | "noshow"
  | "invalid";

export interface GHLCalendar {
  id: string;
  locationId: string;
  name: string;
  description: string | null;
  slug: string | null;
  widgetSlug: string | null;
  calendarType:
    | "round_robin"
    | "event"
    | "class_booking"
    | "collective"
    | "service_booking";
  teamMembers: GHLCalendarTeamMember[];
  isActive: boolean;
  dateUpdated: string;
}

export interface GHLCalendarsListResponse {
  calendars: GHLCalendar[];
}

export interface GHLAppointment {
  id: string;
  calendarId: string;
  locationId: string;
  contactId: string;
  title: string;
  status: GHLAppointmentStatus;
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
  /** GHL returns appointments under the "events" key, not "appointments". */
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
  status?: GHLAppointmentStatus;
}

export interface GHLUpdateAppointmentPayload
  extends Partial<
    Omit<GHLCreateAppointmentPayload, "calendarId" | "locationId">
  > {}

// ── Campaigns ───────────────────────────────────────────────────────────────

export interface GHLCampaign {
  id: string;
  name: string;
  locationId: string;
  status: "draft" | "published" | "archived";
  type: string;
  dateAdded: string;
  dateUpdated: string;
}

export interface GHLCampaignsListResponse {
  campaigns: GHLCampaign[];
}

// ── Locations (Sub-account creation — agency-level) ─────────────────────────

export interface GHLLocation {
  id: string;
  companyId: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  website: string | null;
  timezone: string | null;
  settings: Record<string, unknown>;
  dateAdded: string;
}

export interface GHLCreateLocationPayload {
  companyId: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  website?: string;
  timezone?: string;
  settings?: Record<string, unknown>;
}

export interface GHLLocationResponse {
  location: GHLLocation;
}

// ── Webhooks (agency-level) ─────────────────────────────────────────────────

export interface GHLWebhook {
  id: string;
  locationId: string;
  url: string;
  events: string[];
  verified: boolean;
  dateAdded: string;
}

export interface GHLCreateWebhookPayload {
  locationId: string;
  url: string;
  events: string[];
}

export interface GHLWebhookResponse {
  webhook: GHLWebhook;
}

// ── Token Exchange (agency → sub-account) ─────────────────────────────────

export interface GHLTokenExchangeResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  locationId: string;
}
