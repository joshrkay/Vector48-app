// ---------------------------------------------------------------------------
// GoHighLevel API v2 — Shared Types
// Base URL: https://services.leadconnectorhq.com
// ---------------------------------------------------------------------------

// ── Shared primitives ──────────────────────────────────────────────────────

export interface GHLPaginationMeta {
  startAfterId: string | null;
  startAfter: string | number | null;
  total: number;
  currentPage: number | null;
  nextPage: number | null;
  previousPage: number | null;
  // Legacy aliases used by older call sites / docs variants.
  count?: number;
  prevPage?: number | null;
}

export interface GHLPaginatedResponse<T> {
  data: T[];
  meta: GHLPaginationMeta;
}

export interface GHLApiError {
  code: string;
  message: string;
  retryable: boolean;
  statusCode: number;
}

export type GHLError = GHLApiError;

export interface GHLListParams {
  limit?: number;
  startAfterId?: string;
  startAfter?: number | string;
  locationId?: string;
}

export interface GHLClientOptions {
  locationId?: string;
  // For legacy wrappers this may hold either a location token or the agency key.
  apiKey?: string;
  params?: Record<string, string | number | boolean | undefined>;
  cacheTTLSeconds?: number;
  cacheTags?: string[];
}

// ── Contacts ───────────────────────────────────────────────────────────────

export interface GHLCustomFieldValue {
  id: string;
  fieldValue: string | string[] | number | boolean | null;
}

export interface GHLCustomField {
  id: string;
  name: string;
  fieldKey: string;
  dataType: string;
  placeholder: string | null;
  position: number;
  isMultipleFile?: boolean;
}

export interface GHLContact {
  id: string;
  locationId?: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  tags: string[];
  source: string | null;
  dateAdded: string;
  dateUpdated: string;
  customFields: GHLCustomFieldValue[];
  companyName?: string | null;
  country?: string | null;
  website?: string | null;
  followers?: string[];
  attributions?: Array<{
    url?: string | null;
    campaign?: string | null;
    medium?: string | null;
  }>;
  dnd?: boolean;
  type?: string | null;
  assignedTo?: string | null;
}

export interface GHLContactsListParams extends GHLListParams {
  query?: string;
  email?: string;
  phone?: string;
  tag?: string;
  "dateAdded[gte]"?: string;
  "dateAdded[lte]"?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

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
  locationId?: string;
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

export interface GHLNote {
  id: string;
  body: string;
  contactId?: string;
  userId?: string | null;
  dateAdded: string;
}

export type GHLContactNote = GHLNote;

export interface GHLContactTask {
  id: string;
  contactId: string;
  title: string;
  body: string | null;
  assignedTo: string | null;
  dueDate: string | null;
  completed: boolean;
  dateAdded: string;
}

export interface GHLTag {
  id: string;
  name: string;
  locationId: string;
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
  locationId?: string;
  contactId: string;
  lastMessageBody: string | null;
  lastMessageDate: string | null;
  unreadCount: number;
  type: GHLMessageType | string;
  assignedTo?: string | null;
  lastMessageType?: GHLMessageType | null;
  lastMessageDirection?: "inbound" | "outbound" | null;
  lastMessageSource?: string | null;
  starred?: boolean;
  dateAdded?: string;
  dateUpdated?: string;
}

export interface GHLConversationsListParams extends GHLListParams {
  contactId?: string;
  assignedTo?: string;
  unreadOnly?: boolean;
  sort?: "asc" | "desc";
  sortBy?: "last_message_date" | "date_added";
}

export interface GHLConversationsListResponse {
  conversations: GHLConversation[];
  meta?: GHLPaginationMeta;
}

export interface GHLMessage {
  id: string;
  conversationId?: string;
  locationId?: string;
  contactId?: string;
  body: string;
  dateAdded: string;
  direction: "inbound" | "outbound";
  type: GHLMessageType | string;
  contentType: string;
  status?: "pending" | "delivered" | "read" | "failed" | "sent";
  attachments?: string[];
  source?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface GHLMessagesListParams {
  conversationId?: string;
  limit?: number;
  lastMessageId?: string;
  type?: GHLMessageType;
}

export interface GHLMessagesListResponse {
  messages: GHLMessage[];
  meta?: GHLPaginationMeta;
  nextPage?: boolean;
  lastMessageId?: string;
}

export interface GHLCreateConversationPayload {
  locationId?: string;
  contactId: string;
  assignedTo?: string;
}

export interface GHLSendMessagePayload {
  type: GHLMessageType | string;
  contactId: string;
  conversationId?: string;
  message?: string;
  body?: string;
  subject?: string;
  html?: string;
  attachments?: string[];
  emailFrom?: string;
  emailTo?: string;
  emailCc?: string[];
  emailBcc?: string[];
}

// ── Opportunities / Pipelines ─────────────────────────────────────────────

export type GHLOpportunityStatus = "open" | "won" | "lost" | "abandoned";

export interface GHLOpportunity {
  id: string;
  name: string;
  contactId: string;
  pipelineId: string;
  pipelineStageId: string;
  monetaryValue: number | null;
  status: GHLOpportunityStatus;
  dateAdded: string;
  lastStatusChangeAt: string | null;
  assignedTo?: string | null;
  source?: string | null;
  locationId?: string;
  contact?: Pick<GHLContact, "id" | "name" | "email" | "phone" | "tags"> | null;
  notes?: string[];
  tags?: string[];
  customFields?: GHLCustomFieldValue[];
  dateUpdated?: string;
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

export type GHLOpportunityResponse = GHLOpportunity;

export interface GHLCreateOpportunityPayload {
  locationId?: string;
  pipelineId: string;
  name: string;
  pipelineStageId: string;
  contactId: string;
  status?: GHLOpportunityStatus;
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
  stages: GHLPipelineStage[];
  locationId?: string;
}

export interface GHLPipelinesListResponse {
  pipelines: GHLPipeline[];
}

// ── Calendars / Appointments ───────────────────────────────────────────────

export interface GHLCalendarTeamMember {
  userId: string;
  priority: number;
  meetingLocationType?: string | null;
  meetingLocation?: string | null;
}

export type GHLAppointmentStatus =
  | "confirmed"
  | "cancelled"
  | "showed"
  | "noshow"
  | "invalid";

export interface GHLCalendar {
  id: string;
  name: string;
  locationId?: string;
  description?: string | null;
  slug?: string | null;
  widgetSlug?: string | null;
  calendarType?:
    | "round_robin"
    | "event"
    | "class_booking"
    | "collective"
    | "service_booking";
  teamMembers?: GHLCalendarTeamMember[];
  isActive?: boolean;
  dateUpdated?: string;
}

export interface GHLCalendarsListResponse {
  calendars: GHLCalendar[];
}

export interface GHLCalendarSlotsParams {
  calendarId: string;
  startDate: string;
  endDate: string;
  timezone?: string;
}

export interface GHLCalendarSlot {
  startTime: string;
  endTime: string;
}

export interface GHLCalendarSlotsResponse {
  slots: GHLCalendarSlot[] | Record<string, GHLCalendarSlot[]>;
}

export interface GHLAppointment {
  id: string;
  contactId: string;
  title: string;
  startTime: string;
  endTime: string;
  status: GHLAppointmentStatus;
  calendarId: string;
  notes: string | null;
  assignedUserId: string | null;
  locationId?: string;
  address?: string | null;
  dateAdded?: string;
  dateUpdated?: string;
}

export interface GHLAppointmentsListParams extends GHLListParams {
  calendarId?: string;
  contactId?: string;
  startDate?: string;
  endDate?: string;
  status?: GHLAppointmentStatus;
}

export interface GHLAppointmentsListResponse {
  events: GHLAppointment[];
  meta?: GHLPaginationMeta;
}

export interface GHLCreateAppointmentPayload {
  locationId?: string;
  calendarId: string;
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
  extends Partial<Omit<GHLCreateAppointmentPayload, "locationId" | "calendarId">> {}

// ── Campaigns ──────────────────────────────────────────────────────────────

export type GHLCampaignStatus = "draft" | "published" | "archived";

export interface GHLCampaign {
  id: string;
  name: string;
  status: GHLCampaignStatus | string;
  locationId?: string;
  type?: string;
  dateAdded?: string;
  dateUpdated?: string;
}

export interface GHLCampaignsListResponse {
  campaigns: GHLCampaign[];
}

// ── Locations ──────────────────────────────────────────────────────────────

export interface GHLLocation {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  timezone: string | null;
  companyId?: string;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  website?: string | null;
  settings?: Record<string, unknown>;
  apiKey?: string;
  dateAdded?: string;
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

export interface GHLCreateLocationResponse {
  location: GHLLocation;
}

export interface GHLBusinessHours {
  dayOfWeek:
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday";
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
  isOpen: boolean;
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

// ── Webhooks ───────────────────────────────────────────────────────────────

export type GHLWebhookEvent =
  | "ContactCreate"
  | "ContactUpdate"
  | "ConversationUnread"
  | "ConversationUnreadUpdate"
  | "OpportunityCreate"
  | "OpportunityStageUpdate"
  | "AppointmentCreate"
  | "AppointmentStatusUpdate"
  | "InboundMessage"
  | "CallCompleted";

export interface GHLWebhook {
  id: string;
  url: string;
  events: string[];
  locationId?: string;
  verified?: boolean;
  active?: boolean;
  dateAdded?: string;
}

export interface GHLCreateWebhookPayload {
  locationId: string;
  url: string;
  events: GHLWebhookEvent[];
  secret?: string;
}

export interface GHLWebhookResponse {
  webhook: GHLWebhook;
}

export interface GHLWebhooksListResponse {
  webhooks: GHLWebhook[];
}

// ── Token Exchange ─────────────────────────────────────────────────────────

export interface GHLTokenExchangeResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  locationId: string;
  refresh_token?: string;
  companyId?: string;
  userType?: string;
}

/** Full OAuth token response from `POST /oauth/token`. */
export interface GHLOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  userType: "Company" | "Location";
  companyId: string;
  locationId?: string;
}

// ── Misc compatibility response aliases ────────────────────────────────────

export interface GHLCustomFieldsResponse {
  customFields: GHLCustomFieldValue[];
}

export interface GHLCustomFieldsListResponse {
  customFields: GHLCustomField[];
}
