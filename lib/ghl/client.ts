// ---------------------------------------------------------------------------
// GoHighLevel API v2 — Typed Client (server-only)
// ---------------------------------------------------------------------------

import "server-only";

import {
  GHLRateLimitError,
  GHLAuthError,
  toGHLError,
  type GHLApiError,
} from "./errors";
import type {
  GHLContact,
  GHLContactsListParams,
  GHLContactsSearchParams,
  GHLCreateContactPayload,
  GHLUpdateContactPayload,
  GHLNote,
  GHLCustomField,
  GHLConversation,
  GHLConversationsListParams,
  GHLMessage,
  GHLMessagesListParams,
  GHLSendMessagePayload,
  GHLOpportunity,
  GHLOpportunitiesListParams,
  GHLCreateOpportunityPayload,
  GHLPipeline,
  GHLAppointment,
  GHLAppointmentsListParams,
  GHLCreateAppointmentPayload,
  GHLUpdateAppointmentPayload,
  GHLCalendar,
  GHLCampaign,
  GHLLocation,
  GHLCreateLocationPayload,
  GHLWebhook,
  GHLCreateWebhookPayload,
  GHLPaginatedResponse,
} from "./types";

// ── Constants ──────────────────────────────────────────────────────────────

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [1_000, 2_000, 4_000];
const RATE_LIMIT_PER_MIN = 120;
const RATE_LIMIT_WINDOW_MS = 60_000;

// ── Per-location rate limiter ──────────────────────────────────────────────

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

function checkRateLimit(key: string): void {
  const now = Date.now();
  let bucket = rateBuckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateBuckets.set(key, bucket);
  }

  if (bucket.count >= RATE_LIMIT_PER_MIN) {
    throw new GHLRateLimitError(
      `Local rate limit exceeded for location (${RATE_LIMIT_PER_MIN} req/min)`,
    );
  }

  bucket.count++;
}

// ── Client options ─────────────────────────────────────────────────────────

interface LocationClientOpts {
  locationId: string;
  token: string;
}

interface AgencyClientOpts {
  agencyApiKey: string;
}

export type GHLClientOpts = LocationClientOpts | AgencyClientOpts;

function isAgencyOpts(opts: GHLClientOpts): opts is AgencyClientOpts {
  return "agencyApiKey" in opts;
}

// ── Structured logger ──────────────────────────────────────────────────────

function log(
  level: "info" | "warn" | "error",
  method: string,
  path: string,
  extra?: Record<string, unknown>,
): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    service: "ghl",
    method,
    path,
    ...extra,
  };
  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

// ── GHLClient ──────────────────────────────────────────────────────────────

export class GHLClient {
  private readonly token: string;
  private readonly locationId: string | null;
  private readonly isAgency: boolean;

  readonly contacts: ContactsResource;
  readonly conversations: ConversationsResource;
  readonly opportunities: OpportunitiesResource;
  readonly pipelines: PipelinesResource;
  readonly appointments: AppointmentsResource;
  readonly calendars: CalendarsResource;
  readonly campaigns: CampaignsResource;
  readonly locations: LocationsResource;
  readonly webhooks: WebhooksResource;

  constructor(opts: GHLClientOpts) {
    if (isAgencyOpts(opts)) {
      this.token = opts.agencyApiKey;
      this.locationId = null;
      this.isAgency = true;
    } else {
      this.token = opts.token;
      this.locationId = opts.locationId;
      this.isAgency = false;
    }

    this.contacts = new ContactsResource(this);
    this.conversations = new ConversationsResource(this);
    this.opportunities = new OpportunitiesResource(this);
    this.pipelines = new PipelinesResource(this);
    this.appointments = new AppointmentsResource(this);
    this.calendars = new CalendarsResource(this);
    this.campaigns = new CampaignsResource(this);
    this.locations = new LocationsResource(this);
    this.webhooks = new WebhooksResource(this);
  }

  // ── Internal request method ────────────────────────────────────────────

  /** @internal — used by resource classes. Do not call directly. */
  async _request<T>(
    method: string,
    path: string,
    opts?: {
      body?: unknown;
      params?: Record<string, string | number | boolean | undefined>;
    },
  ): Promise<T> {
    const rateLimitKey = this.locationId ?? "__agency__";
    checkRateLimit(rateLimitKey);

    const url = new URL(path, GHL_BASE_URL);

    if (opts?.params) {
      for (const [k, v] of Object.entries(opts.params)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      Version: GHL_API_VERSION,
    };

    if (this.locationId) {
      headers["locationId"] = this.locationId;
    }

    let lastError: GHLApiError | undefined;
    const start = Date.now();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const backoff = RETRY_BACKOFF_MS[attempt - 1] ?? 4_000;
        await new Promise((r) => setTimeout(r, backoff));
        log("warn", method, path, { attempt, retrying: true });
      }

      let res: Response;
      try {
        res = await fetch(url.toString(), {
          method,
          headers,
          body: opts?.body ? JSON.stringify(opts.body) : undefined,
        });
      } catch (err) {
        // Network error — retryable
        lastError = toGHLError(0, String(err), path);
        continue;
      }

      const durationMs = Date.now() - start;

      if (res.ok) {
        log("info", method, path, { status: res.status, durationMs });
        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      }

      // Parse error body
      let errorBody: unknown;
      try {
        errorBody = await res.json();
      } catch {
        errorBody = await res.text().catch(() => "");
      }

      const err = toGHLError(res.status, errorBody, path);
      log("error", method, path, {
        status: res.status,
        durationMs,
        code: err.code,
      });

      // Retry on retryable errors
      if (err.retryable && attempt < MAX_RETRIES) {
        lastError = err;
        continue;
      }

      throw err;
    }

    throw lastError!;
  }

  // ── Convenience helpers for resources ──────────────────────────────────

  /** @internal */
  _get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    return this._request<T>("GET", path, { params });
  }

  /** @internal */
  _post<T>(path: string, body?: unknown): Promise<T> {
    return this._request<T>("POST", path, { body });
  }

  /** @internal */
  _put<T>(path: string, body?: unknown): Promise<T> {
    return this._request<T>("PUT", path, { body });
  }

  /** @internal */
  _delete<T = void>(path: string): Promise<T> {
    return this._request<T>("DELETE", path);
  }

  /** Ensure this client was created with agency credentials. */
  _assertAgency(operation: string): void {
    if (!this.isAgency) {
      throw new GHLAuthError(
        `Operation "${operation}" requires agency-level credentials`,
      );
    }
  }

  /** Get the locationId (throws if agency-only client). */
  _getLocationId(): string {
    if (!this.locationId) {
      throw new GHLAuthError(
        "This operation requires a location-scoped client",
      );
    }
    return this.locationId;
  }
}

// ── Resource: Contacts ─────────────────────────────────────────────────────

class ContactsResource {
  constructor(private client: GHLClient) {}

  list(params?: GHLContactsListParams) {
    const { locationId, ...rest } = params ?? {};
    return this.client._get<GHLPaginatedResponse<GHLContact>>("/contacts/", {
      locationId: locationId ?? this.client._getLocationId(),
      ...spreadParams(rest),
    });
  }

  get(contactId: string) {
    return this.client._get<{ contact: GHLContact }>(`/contacts/${contactId}`);
  }

  create(data: GHLCreateContactPayload) {
    return this.client._post<{ contact: GHLContact }>("/contacts/", data);
  }

  update(contactId: string, data: GHLUpdateContactPayload) {
    return this.client._put<{ contact: GHLContact }>(
      `/contacts/${contactId}`,
      data,
    );
  }

  /** GHL contacts search uses POST, not GET. */
  search(params: GHLContactsSearchParams) {
    return this.client._post<GHLPaginatedResponse<GHLContact>>(
      "/contacts/search",
      params,
    );
  }

  addTag(contactId: string, tags: string[]) {
    return this.client._post<{ contact: GHLContact }>(
      `/contacts/${contactId}/tags`,
      { tags },
    );
  }

  getNotes(contactId: string) {
    return this.client._get<{ notes: GHLNote[] }>(
      `/contacts/${contactId}/notes`,
    );
  }

  getCustomFields(contactId: string) {
    return this.client._get<{ customFields: GHLCustomField[] }>(
      `/contacts/${contactId}/customFields`,
    );
  }
}

// ── Resource: Conversations ────────────────────────────────────────────────

class ConversationsResource {
  constructor(private client: GHLClient) {}

  list(params?: GHLConversationsListParams) {
    const { locationId, ...rest } = params ?? {};
    return this.client._get<{ conversations: GHLConversation[]; total: number }>(
      "/conversations/",
      {
        locationId: locationId ?? this.client._getLocationId(),
        ...spreadParams(rest),
      },
    );
  }

  getMessages(conversationId: string, params?: GHLMessagesListParams) {
    return this.client._get<{ messages: GHLMessage[]; lastMessageId: string | null }>(
      `/conversations/${conversationId}/messages`,
      params ? spreadParams(params as Record<string, unknown>) : undefined,
    );
  }

  sendMessage(data: GHLSendMessagePayload) {
    return this.client._post<GHLMessage>("/conversations/messages", data);
  }
}

// ── Resource: Opportunities ────────────────────────────────────────────────

class OpportunitiesResource {
  constructor(private client: GHLClient) {}

  /** GHL opportunities list uses /opportunities/search endpoint. */
  list(params?: GHLOpportunitiesListParams) {
    const { locationId, ...rest } = params ?? {};
    return this.client._get<GHLPaginatedResponse<GHLOpportunity>>(
      "/opportunities/search",
      {
        locationId: locationId ?? this.client._getLocationId(),
        ...spreadParams(rest),
      },
    );
  }

  get(opportunityId: string) {
    return this.client._get<{ opportunity: GHLOpportunity }>(
      `/opportunities/${opportunityId}`,
    );
  }

  create(data: GHLCreateOpportunityPayload) {
    return this.client._post<{ opportunity: GHLOpportunity }>(
      "/opportunities/",
      data,
    );
  }

  updateStage(opportunityId: string, pipelineStageId: string) {
    return this.client._put<{ opportunity: GHLOpportunity }>(
      `/opportunities/${opportunityId}`,
      { pipelineStageId },
    );
  }
}

// ── Resource: Pipelines ────────────────────────────────────────────────────

class PipelinesResource {
  constructor(private client: GHLClient) {}

  list() {
    return this.client._get<{ pipelines: GHLPipeline[] }>(
      "/opportunities/pipelines",
    );
  }
}

// ── Resource: Appointments ─────────────────────────────────────────────────

class AppointmentsResource {
  constructor(private client: GHLClient) {}

  list(params?: GHLAppointmentsListParams) {
    const { locationId, ...rest } = params ?? {};
    return this.client._get<{ events: GHLAppointment[] }>(
      "/calendars/events",
      {
        locationId: locationId ?? this.client._getLocationId(),
        ...spreadParams(rest),
      },
    );
  }

  create(data: GHLCreateAppointmentPayload) {
    return this.client._post<{ event: GHLAppointment }>(
      "/calendars/events",
      data,
    );
  }

  update(eventId: string, data: GHLUpdateAppointmentPayload) {
    return this.client._put<{ event: GHLAppointment }>(
      `/calendars/events/${eventId}`,
      data,
    );
  }

  confirm(eventId: string) {
    return this.client._put<{ event: GHLAppointment }>(
      `/calendars/events/${eventId}`,
      { status: "confirmed" },
    );
  }

  cancel(eventId: string) {
    return this.client._put<{ event: GHLAppointment }>(
      `/calendars/events/${eventId}`,
      { status: "cancelled" },
    );
  }
}

// ── Resource: Calendars ────────────────────────────────────────────────────

class CalendarsResource {
  constructor(private client: GHLClient) {}

  list() {
    return this.client._get<{ calendars: GHLCalendar[] }>("/calendars/");
  }
}

// ── Resource: Campaigns ────────────────────────────────────────────────────

class CampaignsResource {
  constructor(private client: GHLClient) {}

  list() {
    return this.client._get<{ campaigns: GHLCampaign[] }>("/campaigns/");
  }
}

// ── Resource: Locations (agency-level) ─────────────────────────────────────

class LocationsResource {
  constructor(private client: GHLClient) {}

  create(data: GHLCreateLocationPayload) {
    this.client._assertAgency("locations.create");
    return this.client._post<{ location: GHLLocation }>("/locations/", data);
  }
}

// ── Resource: Webhooks (agency-level) ──────────────────────────────────────

class WebhooksResource {
  constructor(private client: GHLClient) {}

  create(data: GHLCreateWebhookPayload) {
    this.client._assertAgency("webhooks.create");
    return this.client._post<{ webhook: GHLWebhook }>("/webhooks/", data);
  }

  delete(webhookId: string) {
    this.client._assertAgency("webhooks.delete");
    return this.client._delete(`/webhooks/${webhookId}`);
  }
}

// ── Utility ────────────────────────────────────────────────────────────────

/** Spread list params into a flat Record for query string serialization. */
function spreadParams(
  obj: Record<string, unknown>,
): Record<string, string | number | boolean | undefined> {
  const out: Record<string, string | number | boolean | undefined> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}
