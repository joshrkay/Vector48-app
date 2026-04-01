import "server-only";

// ---------------------------------------------------------------------------
// GoHighLevel API v2 — Typed Client
// ---------------------------------------------------------------------------

import {
  GHLApiError,
  GHLAuthError,
  GHLNetworkError,
  GHLRateLimitError,
  classifyGHLError,
} from "./errors";
import type {
  GHLAppointmentsListParams,
  GHLAppointmentsListResponse,
  GHLAppointment,
  GHLCalendar,
  GHLCalendarsListResponse,
  GHLCalendarSlot,
  GHLCalendarSlotsParams,
  GHLCalendarSlotsResponse,
  GHLCampaign,
  GHLCampaignsListResponse,
  GHLClientOptions,
  GHLContact,
  GHLContactResponse,
  GHLContactsListParams,
  GHLContactsListResponse,
  GHLCreateAppointmentPayload,
  GHLCreateContactPayload,
  GHLCreateLocationPayload,
  GHLCreateOpportunityPayload,
  GHLCreateWebhookPayload,
  GHLCustomField,
  GHLCustomFieldsListResponse,
  GHLCustomFieldsResponse,
  GHLConversation,
  GHLConversationsListParams,
  GHLConversationsListResponse,
  GHLLocation,
  GHLLocationResponse,
  GHLMessage,
  GHLMessagesListParams,
  GHLMessagesListResponse,
  GHLNote,
  GHLOpportunitiesListParams,
  GHLOpportunitiesListResponse,
  GHLOpportunity,
  GHLOpportunityResponse,
  GHLOpportunityStatus,
  GHLPaginatedResponse,
  GHLPaginationMeta,
  GHLPipeline,
  GHLPipelinesListResponse,
  GHLSendMessagePayload,
  GHLTokenExchangeResponse,
  GHLUpdateAppointmentPayload,
  GHLUpdateContactPayload,
  GHLUpdateLocationPayload,
  GHLUpdateOpportunityPayload,
  GHLWebhook,
  GHLWebhookResponse,
} from "./types";
import type {
  GHLAgentActionResponse,
  GHLCreateAgentActionPayload,
  GHLCreateVoiceAgentPayload,
  GHLVoiceAgentResponse,
} from "./voiceTypes";

export type { GHLClientOptions } from "./types";

type LocationClientConfig = {
  locationId: string;
  token: string;
};

type AgencyClientConfig = {
  agencyApiKey: string;
};

type RequestOptions = {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  cacheTTLSeconds?: number;
  cacheTags?: string[];
};

const GHL_API_VERSION = "2021-07-28";
const REQUEST_TIMEOUT_MS = 15_000;
const LOCAL_RATE_LIMIT = 120;
const LOCAL_RATE_WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 4;
const RETRY_BACKOFF_MS = [1_000, 2_000, 4_000];
const RATE_LIMIT_STALE_MS = LOCAL_RATE_WINDOW_MS * 3;

// Docs drift notes:
// - Contacts list officially points to POST /contacts/search in some docs, but
//   existing app flows and wrappers still use GET /contacts/.
// - Conversations docs often show /conversations/search, but existing code uses
//   /conversations/.
// - Appointment docs differ from live behavior; this repo continues to use
//   /calendars/events endpoints for compatibility.
const ENDPOINTS = {
  contacts: "/contacts/",
  contactsSearch: "/contacts/search",
  conversations: "/conversations/",
  sendMessage: "/conversations/messages",
  opportunitiesSearch: "/opportunities/search",
  pipelines: "/opportunities/pipelines",
  calendarEvents: "/calendars/events",
  calendars: "/calendars/",
  campaigns: "/campaigns/",
  locations: "/locations",
  webhooks: "/webhooks",
  tokenExchange: "/oauth/locationToken",
} as const;

interface RateBucket {
  count: number;
  windowStart: number;
  lock: Promise<void>;
  lastAccess: number;
}

const rateBuckets = new Map<string, RateBucket>();

function getBaseUrl(): string {
  return (
    process.env.GHL_API_BASE_URL ?? "https://services.leadconnectorhq.com"
  ).replace(/\/+$/, "");
}

function nowIso(): string {
  return new Date().toISOString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function runExclusive<T>(
  bucket: RateBucket,
  fn: () => Promise<T> | T,
): Promise<T> {
  const previous = bucket.lock;
  let release!: () => void;
  bucket.lock = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

function getRateBucket(key: string): RateBucket {
  const existing = rateBuckets.get(key);
  if (existing) {
    existing.lastAccess = Date.now();
    return existing;
  }

  const bucket: RateBucket = {
    count: 0,
    windowStart: Date.now(),
    lock: Promise.resolve(),
    lastAccess: Date.now(),
  };
  rateBuckets.set(key, bucket);

  if (rateBuckets.size > 250) {
    const cutoff = Date.now() - RATE_LIMIT_STALE_MS;
    for (const [bucketKey, candidate] of Array.from(rateBuckets.entries())) {
      if (candidate.lastAccess < cutoff) {
        rateBuckets.delete(bucketKey);
      }
    }
  }

  return bucket;
}

async function enforceLocalRateLimit(key: string): Promise<void> {
  const bucket = getRateBucket(key);

  await runExclusive(bucket, () => {
    const now = Date.now();
    bucket.lastAccess = now;

    if (now - bucket.windowStart >= LOCAL_RATE_WINDOW_MS) {
      bucket.count = 0;
      bucket.windowStart = now;
    }

    if (bucket.count >= LOCAL_RATE_LIMIT) {
      const retryAfter = Math.max(
        1,
        Math.ceil((bucket.windowStart + LOCAL_RATE_WINDOW_MS - now) / 1000),
      );
      throw new GHLRateLimitError(
        "Local per-location GHL rate limit exceeded",
        retryAfter,
      );
    }

    bucket.count += 1;
  });
}

function logRequest(
  authMode: GHLClient["authMode"],
  scopeKey: string,
  method: string,
  path: string,
  attempt: number,
) {
  console.info(
    JSON.stringify({
      level: "info",
      service: "ghl",
      event: "request",
      authMode,
      scopeKey,
      method,
      path,
      attempt,
      ts: nowIso(),
    }),
  );
}

function logResponse(
  authMode: GHLClient["authMode"],
  scopeKey: string,
  method: string,
  path: string,
  status: number,
  durationMs: number,
) {
  console.info(
    JSON.stringify({
      level: status >= 400 ? "warn" : "info",
      service: "ghl",
      event: "response",
      authMode,
      scopeKey,
      method,
      path,
      status,
      durationMs,
      ts: nowIso(),
    }),
  );
}

function logRetry(
  authMode: GHLClient["authMode"],
  scopeKey: string,
  method: string,
  path: string,
  error: GHLApiError,
  delayMs: number,
  nextAttempt: number,
) {
  console.warn(
    JSON.stringify({
      level: "warn",
      service: "ghl",
      event: "retry",
      authMode,
      scopeKey,
      method,
      path,
      code: error.code,
      statusCode: error.statusCode,
      delayMs,
      nextAttempt,
      ts: nowIso(),
    }),
  );
}

function normalizeMeta(rawMeta: unknown, itemCount: number): GHLPaginationMeta {
  const meta = asRecord(rawMeta);
  const currentPage = toNullableNumber(meta?.currentPage);
  const nextPage = toNullableNumber(meta?.nextPage);
  const previousPage =
    toNullableNumber(meta?.previousPage) ?? toNullableNumber(meta?.prevPage);

  return {
    startAfterId: toNullableString(meta?.startAfterId),
    startAfter: toNullableScalar(meta?.startAfter),
    total: toNumber(meta?.total, itemCount),
    currentPage,
    nextPage,
    previousPage,
    count: toNullableNumber(meta?.count) ?? itemCount,
    prevPage: previousPage,
  };
}

function toPaginatedResponse<T>(
  payload: unknown,
  collectionKeys: string[],
): GHLPaginatedResponse<T> {
  const record = asRecord(payload);
  const data = extractCollection<T>(payload, collectionKeys);

  return {
    data,
    meta: normalizeMeta(record?.meta, data.length),
  };
}

function extractCollection<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  const record = asRecord(payload);
  if (!record) return [];

  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value as T[];
    }
  }

  if (Array.isArray(record.data)) {
    return record.data as T[];
  }

  return [];
}

function extractEntity<T>(payload: unknown, keys: string[]): T {
  const record = asRecord(payload);
  if (record) {
    for (const key of keys) {
      const value = record[key];
      if (value !== undefined) {
        return value as T;
      }
    }
  }

  return payload as T;
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toNullableScalar(value: unknown): string | number | null {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  return null;
}

function parseJsonIfPossible<T>(text: string): T {
  return JSON.parse(text) as T;
}

function buildAbortController() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return { controller, timeout };
}

function buildGetOptions(options?: RequestOptions) {
  if (!options?.cacheTTLSeconds && !options?.cacheTags?.length) {
    return { cache: "no-store" as const };
  }

  return {
    next: {
      revalidate: options.cacheTTLSeconds,
      tags: options.cacheTags,
    },
  };
}

function isRetryableAttempt(error: GHLApiError, attempt: number): boolean {
  return error.retryable && attempt < MAX_ATTEMPTS - 1;
}

function attachLocationIdToParams(
  locationId: string | null,
  params?: Record<string, string | number | boolean | undefined> | null,
): Record<string, string | number | boolean | undefined> | undefined {
  if (!locationId) return params ?? undefined;
  return { locationId, ...(params ?? {}) };
}

function attachLocationIdToBody<T extends object>(
  locationId: string | null,
  body: T,
): T {
  const record = body as T & { locationId?: string };
  if (!locationId || record.locationId) return body;
  return { locationId, ...record } as T;
}

function messageBodyFromPayload(payload: GHLSendMessagePayload): string | undefined {
  return payload.body ?? payload.message;
}

export class GHLClient {
  public readonly authMode: "location" | "agency";

  private readonly token: string;
  private readonly locationId: string | null;
  private readonly scopeKey: string;

  constructor(config: LocationClientConfig | AgencyClientConfig) {
    if ("agencyApiKey" in config) {
      this.authMode = "agency";
      this.token = config.agencyApiKey;
      this.locationId = null;
      this.scopeKey = "__agency__";
      return;
    }

    this.authMode = "location";
    this.token = config.token;
    this.locationId = config.locationId;
    this.scopeKey = config.locationId;
  }

  static forLocation(locationId: string, token: string): GHLClient {
    return new GHLClient({ locationId, token });
  }

  static forAgency(apiKey?: string): GHLClient {
    const agencyApiKey = apiKey ?? process.env.GHL_AGENCY_API_KEY;
    if (!agencyApiKey) {
      throw new Error("GHL_AGENCY_API_KEY is not configured");
    }
    return new GHLClient({ agencyApiKey });
  }

  private assertLocationScope(operation: string): string {
    if (this.authMode !== "location" || !this.locationId) {
      throw new GHLAuthError(
        `${operation} requires a location-scoped GHL token`,
        403,
      );
    }
    return this.locationId;
  }

  private assertAgencyScope(operation: string): void {
    if (this.authMode !== "agency") {
      throw new GHLAuthError(
        `${operation} requires the agency-level GHL API key`,
        403,
      );
    }
  }

  async rawRequest<T>(
    method: string,
    path: string,
    options?: RequestOptions,
  ): Promise<T> {
    await enforceLocalRateLimit(this.scopeKey);

    const url = new URL(path, `${getBaseUrl()}/`);
    for (const [key, value] of Object.entries(options?.params ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    let lastError: GHLApiError | undefined;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      if (attempt > 0) {
        await delay(RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS.at(-1)!);
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
        Version: GHL_API_VERSION,
      };
      if (options?.body !== undefined) {
        headers["Content-Type"] = "application/json";
      }

      logRequest(this.authMode, this.scopeKey, method, path, attempt + 1);

      const { controller, timeout } = buildAbortController();
      const startedAt = Date.now();

      try {
        const response = await fetch(url.toString(), {
          method,
          headers,
          body:
            options?.body !== undefined ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
          ...(method === "GET" ? buildGetOptions(options) : { cache: "no-store" }),
        });

        clearTimeout(timeout);
        logResponse(
          this.authMode,
          this.scopeKey,
          method,
          path,
          response.status,
          Date.now() - startedAt,
        );

        if (response.ok) {
          if (response.status === 204) {
            return undefined as T;
          }

          const text = await response.text();
          if (!text.trim()) {
            return undefined as T;
          }

          return parseJsonIfPossible<T>(text);
        }

        let errorBody: unknown;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = undefined;
        }

        const classified = classifyGHLError(
          response.status,
          errorBody,
          path,
          response.headers.get("retry-after"),
        );

        if (!isRetryableAttempt(classified, attempt)) {
          throw classified;
        }

        lastError = classified;
        logRetry(
          this.authMode,
          this.scopeKey,
          method,
          path,
          classified,
          RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS.at(-1)!,
          attempt + 2,
        );
      } catch (error) {
        clearTimeout(timeout);

        const classified =
          error instanceof GHLApiError
            ? error
            : new GHLNetworkError(
                error instanceof Error && error.name === "AbortError"
                  ? "GHL request timed out"
                  : "GHL network error",
              );

        if (!isRetryableAttempt(classified, attempt)) {
          throw classified;
        }

        lastError = classified;
        logRetry(
          this.authMode,
          this.scopeKey,
          method,
          path,
          classified,
          RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS.at(-1)!,
          attempt + 2,
        );
      }
    }

    throw lastError ?? new GHLNetworkError();
  }

  readonly contacts = {
    list: async (params?: GHLContactsListParams): Promise<GHLPaginatedResponse<GHLContact>> => {
      const payload = await this.rawRequest<GHLContactsListResponse>("GET", ENDPOINTS.contacts, {
        params: attachLocationIdToParams(
          this.locationId,
          params as Record<string, string | number | boolean | undefined> | undefined,
        ),
      });
      return toPaginatedResponse<GHLContact>(payload, ["contacts"]);
    },

    get: async (contactId: string): Promise<GHLContact> => {
      const payload = await this.rawRequest<GHLContactResponse>(
        "GET",
        `${ENDPOINTS.contacts}${contactId}`,
      );
      return extractEntity<GHLContact>(payload, ["contact"]);
    },

    create: async (data: GHLCreateContactPayload): Promise<GHLContact> => {
      const locationId = this.assertLocationScope("contacts.create");
      const payload = await this.rawRequest<GHLContactResponse>("POST", ENDPOINTS.contacts, {
        body: attachLocationIdToBody(locationId, data),
      });
      return extractEntity<GHLContact>(payload, ["contact"]);
    },

    update: async (
      contactId: string,
      data: GHLUpdateContactPayload,
    ): Promise<GHLContact> => {
      this.assertLocationScope("contacts.update");
      const payload = await this.rawRequest<GHLContactResponse>(
        "PUT",
        `${ENDPOINTS.contacts}${contactId}`,
        { body: data },
      );
      return extractEntity<GHLContact>(payload, ["contact"]);
    },

    search: async (query: string): Promise<GHLContact[]> => {
      const list = await this.contacts.list({ query });
      return list.data;
    },

    addTag: async (contactId: string, tag: string): Promise<void> => {
      this.assertLocationScope("contacts.addTag");
      await this.rawRequest("POST", `${ENDPOINTS.contacts}${contactId}/tags`, {
        body: { tags: [tag] },
      });
    },

    getNotes: async (contactId: string): Promise<GHLNote[]> => {
      this.assertLocationScope("contacts.getNotes");
      const payload = await this.rawRequest<{ notes: GHLNote[] }>(
        "GET",
        `${ENDPOINTS.contacts}${contactId}/notes`,
      );
      return extractCollection<GHLNote>(payload, ["notes"]);
    },

    getCustomFields: async (contactId: string): Promise<GHLCustomFieldsResponse["customFields"]> => {
      this.assertLocationScope("contacts.getCustomFields");
      const payload = await this.rawRequest<GHLCustomFieldsResponse>(
        "GET",
        `${ENDPOINTS.contacts}${contactId}/customFields`,
      );
      return extractCollection(payload, ["customFields"]);
    },
  };

  readonly conversations = {
    list: async (
      params?: GHLConversationsListParams,
    ): Promise<GHLPaginatedResponse<GHLConversation>> => {
      const payload = await this.rawRequest<GHLConversationsListResponse>(
        "GET",
        ENDPOINTS.conversations,
        {
          params: attachLocationIdToParams(
            this.locationId,
            params as Record<string, string | number | boolean | undefined> | undefined,
          ),
        },
      );
      return toPaginatedResponse<GHLConversation>(payload, ["conversations"]);
    },

    getMessages: async (
      conversationId: string,
      params?: Omit<GHLMessagesListParams, "conversationId">,
    ): Promise<GHLMessage[]> => {
      this.assertLocationScope("conversations.getMessages");
      const payload = await this.rawRequest<GHLMessagesListResponse>(
        "GET",
        `${ENDPOINTS.conversations}${conversationId}/messages`,
        { params },
      );
      return extractCollection<GHLMessage>(payload, ["messages"]);
    },

    sendMessage: async (
      conversationId: string,
      data: GHLSendMessagePayload,
    ): Promise<GHLMessage> => {
      this.assertLocationScope("conversations.sendMessage");
      const payload = await this.rawRequest<GHLMessage>(
        "POST",
        ENDPOINTS.sendMessage,
        {
          body: {
            ...data,
            conversationId,
            message: messageBodyFromPayload(data),
          },
        },
      );
      return extractEntity<GHLMessage>(payload, ["message"]);
    },
  };

  readonly opportunities = {
    list: async (
      params?: GHLOpportunitiesListParams,
    ): Promise<GHLPaginatedResponse<GHLOpportunity>> => {
      const payload = await this.rawRequest<GHLOpportunitiesListResponse>(
        "GET",
        ENDPOINTS.opportunitiesSearch,
        {
          params: attachLocationIdToParams(
            this.locationId,
            params as Record<string, string | number | boolean | undefined> | undefined,
          ),
        },
      );
      return toPaginatedResponse<GHLOpportunity>(payload, ["opportunities"]);
    },

    get: async (opportunityId: string): Promise<GHLOpportunity> => {
      const payload = await this.rawRequest<GHLOpportunityResponse>(
        "GET",
        `/opportunities/${opportunityId}`,
      );
      return extractEntity<GHLOpportunity>(payload, ["opportunity"]);
    },

    create: async (data: GHLCreateOpportunityPayload): Promise<GHLOpportunity> => {
      const locationId = this.assertLocationScope("opportunities.create");
      const payload = await this.rawRequest<GHLOpportunityResponse>(
        "POST",
        "/opportunities/",
        { body: attachLocationIdToBody(locationId, data) },
      );
      return extractEntity<GHLOpportunity>(payload, ["opportunity"]);
    },

    update: async (
      opportunityId: string,
      data: GHLUpdateOpportunityPayload,
    ): Promise<GHLOpportunity> => {
      this.assertLocationScope("opportunities.update");
      const payload = await this.rawRequest<GHLOpportunityResponse>(
        "PUT",
        `/opportunities/${opportunityId}`,
        { body: data },
      );
      return extractEntity<GHLOpportunity>(payload, ["opportunity"]);
    },

    updateStage: async (
      opportunityId: string,
      stageId: string,
    ): Promise<GHLOpportunity> => {
      return this.opportunities.update(opportunityId, {
        pipelineStageId: stageId,
      });
    },

    updateStatus: async (
      opportunityId: string,
      status: GHLOpportunityStatus,
    ): Promise<GHLOpportunity> => {
      this.assertLocationScope("opportunities.updateStatus");
      const payload = await this.rawRequest<GHLOpportunityResponse>(
        "PUT",
        `/opportunities/${opportunityId}/status`,
        { body: { status } },
      );
      return extractEntity<GHLOpportunity>(payload, ["opportunity"]);
    },
  };

  readonly pipelines = {
    list: async (): Promise<GHLPipeline[]> => {
      this.assertLocationScope("pipelines.list");
      const payload = await this.rawRequest<GHLPipelinesListResponse>(
        "GET",
        ENDPOINTS.pipelines,
      );
      return extractCollection<GHLPipeline>(payload, ["pipelines"]);
    },
  };

  readonly appointments = {
    list: async (params?: GHLAppointmentsListParams): Promise<GHLAppointment[]> => {
      const payload = await this.rawRequest<GHLAppointmentsListResponse>(
        "GET",
        ENDPOINTS.calendarEvents,
        {
          params: attachLocationIdToParams(
            this.locationId,
            params as Record<string, string | number | boolean | undefined> | undefined,
          ),
        },
      );
      return extractCollection<GHLAppointment>(payload, ["events", "appointments"]);
    },

    get: async (eventId: string): Promise<GHLAppointment> => {
      const payload = await this.rawRequest<{ event: GHLAppointment }>(
        "GET",
        `${ENDPOINTS.calendarEvents}/${eventId}`,
      );
      return extractEntity<GHLAppointment>(payload, ["event", "appointment"]);
    },

    create: async (data: GHLCreateAppointmentPayload): Promise<GHLAppointment> => {
      const locationId = this.assertLocationScope("appointments.create");
      const payload = await this.rawRequest<{ event: GHLAppointment }>(
        "POST",
        ENDPOINTS.calendarEvents,
        { body: attachLocationIdToBody(locationId, data) },
      );
      return extractEntity<GHLAppointment>(payload, ["event", "appointment"]);
    },

    update: async (
      eventId: string,
      data: GHLUpdateAppointmentPayload,
    ): Promise<GHLAppointment> => {
      this.assertLocationScope("appointments.update");
      const payload = await this.rawRequest<{ event: GHLAppointment }>(
        "PUT",
        `${ENDPOINTS.calendarEvents}/${eventId}`,
        { body: data },
      );
      return extractEntity<GHLAppointment>(payload, ["event", "appointment"]);
    },
  };

  readonly calendars = {
    list: async (): Promise<GHLCalendar[]> => {
      this.assertLocationScope("calendars.list");
      const payload = await this.rawRequest<GHLCalendarsListResponse>(
        "GET",
        ENDPOINTS.calendars,
      );
      return extractCollection<GHLCalendar>(payload, ["calendars"]);
    },

    getSlots: async (
      params: GHLCalendarSlotsParams,
    ): Promise<Record<string, GHLCalendarSlot[]> | GHLCalendarSlot[]> => {
      this.assertLocationScope("calendars.getSlots");
      const { calendarId, ...rest } = params;
      const payload = await this.rawRequest<GHLCalendarSlotsResponse>(
        "GET",
        `/calendars/${calendarId}/free-slots`,
        { params: rest },
      );
      const record = asRecord(payload);
      return (record?.slots as Record<string, GHLCalendarSlot[]> | GHLCalendarSlot[]) ?? [];
    },
  };

  readonly campaigns = {
    list: async (): Promise<GHLCampaign[]> => {
      this.assertLocationScope("campaigns.list");
      const payload = await this.rawRequest<GHLCampaignsListResponse>(
        "GET",
        ENDPOINTS.campaigns,
      );
      return extractCollection<GHLCampaign>(payload, ["campaigns"]);
    },
  };

  readonly locations = {
    create: async (data: GHLCreateLocationPayload): Promise<GHLLocation> => {
      this.assertAgencyScope("locations.create");
      const payload = await this.rawRequest<GHLLocationResponse>(
        "POST",
        ENDPOINTS.locations,
        { body: data },
      );
      return extractEntity<GHLLocation>(payload, ["location"]);
    },

    update: async (data: GHLUpdateLocationPayload): Promise<GHLLocation> => {
      const locationId = this.assertLocationScope("locations.update");
      const payload = await this.rawRequest<GHLLocationResponse>(
        "PUT",
        `${ENDPOINTS.locations}/${locationId}`,
        { body: data },
      );
      return extractEntity<GHLLocation>(payload, ["location"]);
    },
  };

  readonly webhooks = {
    create: async (data: GHLCreateWebhookPayload): Promise<GHLWebhook> => {
      this.assertAgencyScope("webhooks.create");
      const payload = await this.rawRequest<GHLWebhookResponse>(
        "POST",
        ENDPOINTS.webhooks,
        { body: data },
      );
      return extractEntity<GHLWebhook>(payload, ["webhook"]);
    },

    delete: async (webhookId: string): Promise<void> => {
      this.assertAgencyScope("webhooks.delete");
      await this.rawRequest("DELETE", `${ENDPOINTS.webhooks}/${webhookId}`);
    },
  };

  readonly customFields = {
    list: async (locationId?: string): Promise<GHLCustomField[]> => {
      const resolvedLocationId =
        locationId ?? this.assertLocationScope("customFields.list");
      const payload = await this.rawRequest<GHLCustomFieldsListResponse>(
        "GET",
        `/locations/${resolvedLocationId}/customFields`,
      );
      return extractCollection<GHLCustomField>(payload, ["customFields"]);
    },
  };

  readonly voiceAgent = {
    create: (data: GHLCreateVoiceAgentPayload) => {
      this.assertLocationScope("voiceAgent.create");
      return this.rawRequest<GHLVoiceAgentResponse>(
        "POST",
        "/conversations/providers/voice-ai/agents",
        { body: data },
      );
    },

    createAction: (agentId: string, data: GHLCreateAgentActionPayload) => {
      this.assertLocationScope("voiceAgent.createAction");
      return this.rawRequest<GHLAgentActionResponse>(
        "POST",
        `/conversations/providers/voice-ai/agents/${agentId}/actions`,
        { body: data },
      );
    },
  };

  static async exchangeSubAccountToken(
    companyId: string,
    locationId: string,
  ): Promise<GHLTokenExchangeResponse> {
    const agencyApiKey = process.env.GHL_AGENCY_API_KEY;
    if (!agencyApiKey) {
      throw new Error("GHL_AGENCY_API_KEY is not configured");
    }

    const client = new GHLClient({ agencyApiKey });
    return client.rawRequest<GHLTokenExchangeResponse>("POST", ENDPOINTS.tokenExchange, {
      body: { companyId, locationId },
    });
  }
}

function clientFromOpts(opts?: GHLClientOptions): GHLClient {
  if (opts?.locationId) {
    const token = opts.apiKey ?? process.env.GHL_AGENCY_API_KEY ?? "";
    return GHLClient.forLocation(opts.locationId, token);
  }

  return GHLClient.forAgency(opts?.apiKey);
}

export async function ghlGet<T>(
  path: string,
  opts?: GHLClientOptions,
): Promise<T> {
  const params =
    opts?.locationId && !opts.params?.locationId
      ? { locationId: opts.locationId, ...(opts.params ?? {}) }
      : opts?.params;

  return clientFromOpts(opts).rawRequest<T>("GET", path, {
    params,
    cacheTTLSeconds: opts?.cacheTTLSeconds,
    cacheTags: opts?.cacheTags,
  });
}

export async function ghlPost<T>(
  path: string,
  body: unknown,
  opts?: GHLClientOptions,
): Promise<T> {
  return clientFromOpts(opts).rawRequest<T>("POST", path, { body });
}

export async function ghlPut<T>(
  path: string,
  body: unknown,
  opts?: GHLClientOptions,
): Promise<T> {
  return clientFromOpts(opts).rawRequest<T>("PUT", path, { body });
}

export async function ghlDelete<T = void>(
  path: string,
  opts?: GHLClientOptions,
): Promise<T> {
  return clientFromOpts(opts).rawRequest<T>("DELETE", path);
}
