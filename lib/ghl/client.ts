// ---------------------------------------------------------------------------
// GoHighLevel API v2 — Typed Client
// Server-only: never import this file in client components.
// ---------------------------------------------------------------------------
import "server-only";

import {
  GHLApiError,
  GHLRateLimitError,
  classifyGHLError,
} from "./errors";
import type {
  GHLClientOptions,
  GHLContactsListParams,
  GHLContactsListResponse,
  GHLContactResponse,
  GHLCreateContactPayload,
  GHLUpdateContactPayload,
  GHLNote,
  GHLCustomField,
  GHLCustomFieldValue,
  GHLConversationsListParams,
  GHLConversationsListResponse,
  GHLMessagesListParams,
  GHLMessagesListResponse,
  GHLMessage,
  GHLSendMessagePayload,
  GHLOpportunitiesListParams,
  GHLOpportunitiesListResponse,
  GHLOpportunityResponse,
  GHLCreateOpportunityPayload,
  GHLUpdateOpportunityPayload,
  GHLPipelinesListResponse,
  GHLAppointmentsListParams,
  GHLAppointmentsListResponse,
  GHLAppointment,
  GHLCreateAppointmentPayload,
  GHLUpdateAppointmentPayload,
  GHLCalendarsListResponse,
  GHLCampaignsListResponse,
  GHLCreateLocationPayload,
  GHLLocationResponse,
  GHLCreateWebhookPayload,
  GHLWebhookResponse,
} from "./types";

export type { GHLClientOptions } from "./types";

// ── Constants ───────────────────────────────────────────────────────────────

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [1_000, 2_000, 4_000];
const RATE_LIMIT_PER_MIN = 120;
const RATE_LIMIT_WINDOW_MS = 60_000;

// ── Per-location rate limiter (120 req / 60 s) ─────────────────────────────

const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

interface RateBucket {
  tokens: number;
  lastRefill: number;
}

/** One bucket per locationId. Agency calls use "__agency__". */
const rateBuckets = new Map<string, RateBucket>();

/** Evict buckets idle for longer than 2 rate windows to prevent memory leaks. */
const STALE_THRESHOLD_MS = RATE_WINDOW_MS * 2;

function evictStaleBuckets() {
  const now = Date.now();
  rateBuckets.forEach((bucket, key) => {
    if (now - bucket.lastRefill > STALE_THRESHOLD_MS) {
      rateBuckets.delete(key);
    }
  });
}

function getBucket(key: string): RateBucket {
  let bucket = rateBuckets.get(key);
  if (!bucket) {
    // Good time to clean up stale entries when creating new ones
    if (rateBuckets.size > 100) evictStaleBuckets();
    bucket = { tokens: RATE_LIMIT, lastRefill: Date.now() };
    rateBuckets.set(key, bucket);
  }
  return bucket;
}

function consumeToken(key: string): boolean {
  const bucket = getBucket(key);
  const now = Date.now();
  if (now - bucket.lastRefill >= RATE_WINDOW_MS) {
    bucket.tokens = RATE_LIMIT;
    bucket.lastRefill = now;
  }
  if (bucket.tokens > 0) {
    bucket.tokens--;
    return true;
  }
  return false;
}

async function waitForToken(key: string): Promise<void> {
  while (!consumeToken(key)) {
    const bucket = getBucket(key);
    const waitMs = RATE_WINDOW_MS - (Date.now() - bucket.lastRefill);
    await new Promise((r) => setTimeout(r, Math.max(waitMs, 100)));
  }
}

// ── Structured logger (no PII) ─────────────────────────────────────────────

function logRequest(method: string, path: string, locationKey: string) {
  console.log(
    JSON.stringify({
      level: "info",
      service: "ghl",
      event: "request",
      method,
      path,
      locationKey,
      ts: new Date().toISOString(),
    }),
  );
}

function logResponse(
  method: string,
  path: string,
  status: number,
  durationMs: number,
) {
  console.log(
    JSON.stringify({
      level: status >= 400 ? "warn" : "info",
      service: "ghl",
      event: "response",
      method,
      path,
      status,
      durationMs,
      ts: new Date().toISOString(),
    }),
  );
}

// ── GHLClient ───────────────────────────────────────────────────────────────

export class GHLClient {
  private readonly token: string;
  private readonly locationId: string | null;
  private readonly rateLimitKey: string;

  // ── Constructors ────────────────────────────────────────────────────────

  private constructor(token: string, locationId: string | null) {
    this.token = token;
    this.locationId = locationId;
    this.rateLimitKey = locationId ?? "__agency__";
  }

  /** Create a client for CRM operations scoped to a specific location. */
  static forLocation(locationId: string, token: string): GHLClient {
    return new GHLClient(token, locationId);
  }

  /** Create a client for agency-level admin operations. */
  static forAgency(apiKey?: string): GHLClient {
    const key = apiKey ?? process.env.GHL_AGENCY_API_KEY;
    if (!key) {
      throw new Error(
        "GHL agency API key is required. Set GHL_AGENCY_API_KEY or pass apiKey.",
      );
    }
    return new GHLClient(key, null);
  }

  // ── Core fetch wrapper ──────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    opts?: {
      body?: unknown;
      params?: Record<string, string | number | boolean | undefined>;
    },
  ): Promise<T> {
    await waitForToken(this.rateLimitKey);

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

    logRequest(method, path, this.rateLimitKey);

    let lastError: GHLApiError | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const backoff = RETRY_BACKOFF_MS[attempt - 1] ?? 4_000;
        await new Promise((r) => setTimeout(r, backoff));
      }

      const start = Date.now();
      let res: Response;
      try {
        res = await fetch(url.toString(), {
          method,
          headers,
          body: opts?.body ? JSON.stringify(opts.body) : undefined,
        });
      } catch (err) {
        // Network errors are retryable
        lastError = new GHLApiError(
          0,
          err instanceof Error ? err.message : "Network error",
          "NETWORK_ERROR",
          true,
        );
        continue;
      }

      logResponse(method, path, res.status, Date.now() - start);

      if (res.ok) {
        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      }

      // Parse error body (never leak raw to callers)
      let errorBody: unknown;
      try {
        errorBody = await res.json();
      } catch {
        try {
          errorBody = await res.text();
        } catch {
          errorBody = undefined;
        }
      }

      const classified = classifyGHLError(res.status, errorBody, path);

      if (classified.retryable) {
        lastError = classified;
        continue;
      }

      // Non-retryable — throw immediately
      throw classified;
    }

    // All retries exhausted
    throw lastError ?? new GHLRateLimitError("All retries exhausted");
  }

  private get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    return this.request<T>("GET", path, { params });
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, { body });
  }

  private put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PUT", path, { body });
  }

  private delete<T = void>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  // ── Contacts ────────────────────────────────────────────────────────────

  readonly contacts = {
    list: (params?: GHLContactsListParams) => {
      const { locationId, ...rest } = params ?? {};
      return this.get<GHLContactsListResponse>("/contacts/", {
        locationId: locationId ?? this.locationId ?? undefined,
        ...rest,
      } as Record<string, string | number | boolean | undefined>);
    },

    get: (contactId: string) => {
      return this.get<GHLContactResponse>(`/contacts/${contactId}`);
    },

    create: (data: GHLCreateContactPayload) => {
      return this.post<GHLContactResponse>("/contacts/", data);
    },

    update: (contactId: string, data: GHLUpdateContactPayload) => {
      return this.put<GHLContactResponse>(`/contacts/${contactId}`, data);
    },

    search: (query: string, params?: Omit<GHLContactsListParams, "query">) => {
      return this.contacts.list({ ...params, query });
    },

    addTag: (contactId: string, tags: string[]) => {
      return this.post<GHLContactResponse>(
        `/contacts/${contactId}/tags`,
        { tags },
      );
    },

    getNotes: (contactId: string) => {
      return this.get<{ notes: GHLNote[] }>(`/contacts/${contactId}/notes`);
    },

    getCustomFields: (contactId: string) => {
      return this.get<{ customFields: GHLCustomFieldValue[] }>(
        `/contacts/${contactId}/customFields`,
      );
    },
  };

  // ── Conversations ───────────────────────────────────────────────────────

  readonly conversations = {
    list: (params?: GHLConversationsListParams) => {
      const { locationId, ...rest } = params ?? {};
      return this.get<GHLConversationsListResponse>("/conversations/", {
        locationId: locationId ?? this.locationId ?? undefined,
        ...rest,
      } as Record<string, string | number | boolean | undefined>);
    },

    getMessages: (
      conversationId: string,
      params?: GHLMessagesListParams,
    ) => {
      return this.get<GHLMessagesListResponse>(
        `/conversations/${conversationId}/messages`,
        params as Record<string, string | number | boolean | undefined>,
      );
    },

    sendMessage: (conversationId: string, data: GHLSendMessagePayload) => {
      return this.post<GHLMessage>("/conversations/messages", {
        ...data,
        conversationId,
      });
    },
  };

  // ── Opportunities ───────────────────────────────────────────────────────

  readonly opportunities = {
    list: (params?: GHLOpportunitiesListParams) => {
      const { locationId, ...rest } = params ?? {};
      return this.get<GHLOpportunitiesListResponse>(
        "/opportunities/search",
        {
          locationId: locationId ?? this.locationId ?? undefined,
          ...rest,
        } as Record<string, string | number | boolean | undefined>,
      );
    },

    get: (opportunityId: string) => {
      return this.get<GHLOpportunityResponse>(
        `/opportunities/${opportunityId}`,
      );
    },

    create: (data: GHLCreateOpportunityPayload) => {
      return this.post<GHLOpportunityResponse>("/opportunities/", data);
    },

    updateStage: (
      opportunityId: string,
      stageId: string,
    ) => {
      return this.put<GHLOpportunityResponse>(
        `/opportunities/${opportunityId}`,
        { pipelineStageId: stageId },
      );
    },
  };

  // ── Pipelines ───────────────────────────────────────────────────────────

  readonly pipelines = {
    list: () => {
      return this.get<GHLPipelinesListResponse>(
        "/opportunities/pipelines",
      );
    },
  };

  // ── Appointments ────────────────────────────────────────────────────────

  readonly appointments = {
    list: (params?: GHLAppointmentsListParams) => {
      const { locationId, ...rest } = params ?? {};
      return this.get<GHLAppointmentsListResponse>("/calendars/events", {
        locationId: locationId ?? this.locationId ?? undefined,
        ...rest,
      } as Record<string, string | number | boolean | undefined>);
    },

    create: (data: GHLCreateAppointmentPayload) => {
      return this.post<{ event: GHLAppointment }>(
        "/calendars/events",
        data,
      );
    },

    update: (eventId: string, data: GHLUpdateAppointmentPayload) => {
      return this.put<{ event: GHLAppointment }>(
        `/calendars/events/${eventId}`,
        data,
      );
    },

    confirm: (eventId: string) => {
      return this.put<{ event: GHLAppointment }>(
        `/calendars/events/${eventId}`,
        { status: "confirmed" },
      );
    },

    cancel: (eventId: string) => {
      return this.put<{ event: GHLAppointment }>(
        `/calendars/events/${eventId}`,
        { status: "cancelled" },
      );
    },
  };

  // ── Calendars ───────────────────────────────────────────────────────────

  readonly calendars = {
    list: () => {
      return this.get<GHLCalendarsListResponse>("/calendars/");
    },
  };

  // ── Campaigns (read-only) ───────────────────────────────────────────────

  readonly campaigns = {
    list: () => {
      return this.get<GHLCampaignsListResponse>("/campaigns/");
    },
  };

  // ── Custom Fields ───────────────────────────────────────────────────────

  readonly customFields = {
    list: (locationId?: string) => {
      const locId = locationId ?? this.locationId;
      return this.get<{ customFields: GHLCustomField[] }>(
        `/locations/${locId}/customFields`,
      );
    },
  };

  // ── Locations (agency-level only) ───────────────────────────────────────

  readonly locations = {
    create: (data: GHLCreateLocationPayload) => {
      return this.post<GHLLocationResponse>("/locations/", data);
    },
  };

  // ── Webhooks (agency-level only) ────────────────────────────────────────

  readonly webhooks = {
    create: (data: GHLCreateWebhookPayload) => {
      return this.post<GHLWebhookResponse>("/webhooks/", data);
    },

    delete: (webhookId: string) => {
      return this.delete(`/webhooks/${webhookId}`);
    },
  };
}

// ── Function-style wrappers ──────────────────────────────────────────────────
// Legacy service files (contacts.ts, calendars.ts, etc.) import these helpers.
// They create a one-shot GHLClient from the options and delegate.

function clientFromOpts(opts?: GHLClientOptions): GHLClient {
  if (opts?.locationId) {
    const token =
      opts.apiKey ?? process.env.GHL_AGENCY_API_KEY ?? "";
    return GHLClient.forLocation(opts.locationId, token);
  }
  return GHLClient.forAgency(opts?.apiKey);
}

export async function ghlGet<T>(
  path: string,
  opts?: GHLClientOptions,
): Promise<T> {
  const client = clientFromOpts(opts);
  // Use the class's private request via a thin cast so we can call the
  // internal method without duplicating fetch logic.
  return (client as unknown as { request: (m: string, p: string, o?: { params?: Record<string, string | number | boolean | undefined> }) => Promise<T> })
    .request("GET", path, { params: opts?.params });
}

export async function ghlPost<T>(
  path: string,
  body: unknown,
  opts?: GHLClientOptions,
): Promise<T> {
  return (clientFromOpts(opts) as unknown as { request: (m: string, p: string, o?: { body?: unknown }) => Promise<T> })
    .request("POST", path, { body });
}

export async function ghlPut<T>(
  path: string,
  body: unknown,
  opts?: GHLClientOptions,
): Promise<T> {
  return (clientFromOpts(opts) as unknown as { request: (m: string, p: string, o?: { body?: unknown }) => Promise<T> })
    .request("PUT", path, { body });
}

export async function ghlDelete<T = void>(
  path: string,
  opts?: GHLClientOptions,
): Promise<T> {
  return (clientFromOpts(opts) as unknown as { request: (m: string, p: string) => Promise<T> })
    .request("DELETE", path);
}
