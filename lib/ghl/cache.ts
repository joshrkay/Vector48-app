// ---------------------------------------------------------------------------
// GoHighLevel — Tier-Aware Caching Wrapper
// Wraps all GHL read methods and forwards dynamic revalidate/tag hints to the
// fetch layer. Exports cachedGHLClient(accountId).
// Server-only.
// ---------------------------------------------------------------------------

import { cacheStore, ensureSweep } from "./cacheStore";
import { getTierConfig } from "./tierConfig";
import type { GHLClientOptions } from "./client";

// Service imports — the underlying (uncached) functions
import {
  getContacts,
  getContact,
  getContactNotes,
  getContactTasks,
} from "./contacts";
import {
  getPipelines,
  getOpportunities,
  getOpportunity,
} from "./opportunities";
import {
  getConversations,
  getConversation,
  getMessages,
} from "./conversations";
import {
  getCalendars,
  getCalendar,
  getCalendarSlots,
  getAppointments,
  getAppointment,
} from "./calendars";

import type {
  GHLContactsListParams,
  GHLContactsListResponse,
  GHLContactResponse,
  GHLContactNote,
  GHLContactTask,
  GHLOpportunitiesListParams,
  GHLOpportunitiesListResponse,
  GHLOpportunityResponse,
  GHLPipelinesListResponse,
  GHLConversationsListParams,
  GHLConversationsListResponse,
  GHLConversation,
  GHLMessagesListParams,
  GHLMessagesListResponse,
  GHLAppointmentsListParams,
  GHLAppointmentsListResponse,
  GHLAppointment,
  GHLCalendarsListResponse,
  GHLCalendar,
  GHLCalendarSlotsParams,
  GHLCalendarSlotsResponse,
} from "./types";

// ── Cache key builder ─────────────────────────────────────────────────────

function stableStringify(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map((item) => normalize(item));
    if (input && typeof input === "object") {
      const obj = input as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(obj).sort()) {
        const v = obj[key];
        if (v !== undefined) {
          sorted[key] = normalize(v);
        }
      }
      return sorted;
    }
    return input;
  };

  return JSON.stringify(normalize(value) ?? null);
}

// ── In-flight request dedup (prevents cache stampede) ─────────────────────

const inflight = new Map<string, Promise<unknown>>();

function buildCacheKey(
  accountId: string,
  resource: string,
  params?: unknown,
): string {
  const hash = stableStringify(params ?? {});
  return `ghl:${accountId}:${resource}:${hash}`;
}

function buildResourceTag(accountId: string, resource: string): string {
  return `ghl:${accountId}:${resource}`;
}

function mergeOptions(
  opts: GHLClientOptions | undefined,
  cacheTTLSeconds: number,
  cacheTags: string[],
): GHLClientOptions {
  const mergedTags = Array.from(
    new Set([...(opts?.cacheTags ?? []), ...cacheTags]),
  );
  return {
    ...(opts ?? {}),
    cacheTTLSeconds,
    cacheTags: mergedTags,
  };
}

// ── Generic cache wrapper ─────────────────────────────────────────────────

async function withCache<T>(
  accountId: string,
  resource: string,
  params: unknown,
  opts: GHLClientOptions | undefined,
  fetcher: (nextOpts: GHLClientOptions) => Promise<T>,
): Promise<T> {
  const cacheKey = buildCacheKey(accountId, resource, params);
  const cacheTag = buildResourceTag(accountId, resource);
  const cached = cacheStore.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }

  if (cached) {
    cacheStore.delete(cacheKey);
  }

  // Deduplicate concurrent requests for the same key (cache stampede protection)
  const pending = inflight.get(cacheKey);
  if (pending) {
    return pending as Promise<T>;
  }

  const promise = (async () => {
    try {
      const config = await getTierConfig(accountId);
      const nextOpts = mergeOptions(opts, config.cacheTTL, [cacheTag]);
      const data = await fetcher(nextOpts);

      cacheStore.set(cacheKey, {
        data,
        expiresAt: Date.now() + config.cacheTTL * 1_000,
      });
      ensureSweep();

      return data;
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, promise);
  return promise;
}

// ── Cached client type ────────────────────────────────────────────────────

export interface CachedGHLClient {
  // Contacts
  getContacts: (
    params?: GHLContactsListParams,
    opts?: GHLClientOptions,
  ) => Promise<GHLContactsListResponse>;
  getContact: (
    contactId: string,
    opts?: GHLClientOptions,
  ) => Promise<GHLContactResponse>;
  getContactNotes: (
    contactId: string,
    opts?: GHLClientOptions,
  ) => Promise<{ notes: GHLContactNote[] }>;
  getContactTasks: (
    contactId: string,
    opts?: GHLClientOptions,
  ) => Promise<{ tasks: GHLContactTask[] }>;

  // Opportunities
  getPipelines: (
    opts?: GHLClientOptions,
  ) => Promise<GHLPipelinesListResponse>;
  getOpportunities: (
    params?: GHLOpportunitiesListParams,
    opts?: GHLClientOptions,
  ) => Promise<GHLOpportunitiesListResponse>;
  getOpportunity: (
    opportunityId: string,
    opts?: GHLClientOptions,
  ) => Promise<GHLOpportunityResponse>;

  // Conversations
  getConversations: (
    params?: GHLConversationsListParams,
    opts?: GHLClientOptions,
  ) => Promise<GHLConversationsListResponse>;
  getConversation: (
    conversationId: string,
    opts?: GHLClientOptions,
  ) => Promise<{ conversation: GHLConversation }>;
  getMessages: (
    params: GHLMessagesListParams,
    opts?: GHLClientOptions,
  ) => Promise<GHLMessagesListResponse>;

  // Calendars
  getCalendars: (
    opts?: GHLClientOptions,
  ) => Promise<GHLCalendarsListResponse>;
  getCalendar: (
    calendarId: string,
    opts?: GHLClientOptions,
  ) => Promise<{ calendar: GHLCalendar }>;
  getCalendarSlots: (
    params: GHLCalendarSlotsParams,
    opts?: GHLClientOptions,
  ) => Promise<GHLCalendarSlotsResponse>;
  getAppointments: (
    params?: GHLAppointmentsListParams,
    opts?: GHLClientOptions,
  ) => Promise<GHLAppointmentsListResponse>;
  getAppointment: (
    eventId: string,
    opts?: GHLClientOptions,
  ) => Promise<{ event: GHLAppointment }>;
}

// ── Factory ───────────────────────────────────────────────────────────────

/**
 * Returns a GHL client where every read method is wrapped with tier-aware
 * fetch cache hints. The cache TTL comes from the account's pricing_config.
 *
 * Usage:
 * ```ts
 * const client = cachedGHLClient("account-uuid");
 * const { contacts } = await client.getContacts({ limit: 50 }, { locationId });
 * ```
 */
export function cachedGHLClient(accountId: string): CachedGHLClient {
  return {
    // ── Contacts ────────────────────────────────────────────────────────
    getContacts: (params?, opts?) =>
      withCache(accountId, "contacts:list", params, opts, (cacheOpts) =>
        getContacts(params, cacheOpts),
      ),
    getContact: (contactId, opts?) =>
      withCache(accountId, "contacts:get", { contactId }, opts, (cacheOpts) =>
        getContact(contactId, cacheOpts),
      ),
    getContactNotes: (contactId, opts?) =>
      withCache(accountId, "contacts:notes", { contactId }, opts, (cacheOpts) =>
        getContactNotes(contactId, cacheOpts),
      ),
    getContactTasks: (contactId, opts?) =>
      withCache(accountId, "contacts:tasks", { contactId }, opts, (cacheOpts) =>
        getContactTasks(contactId, cacheOpts),
      ),

    // ── Opportunities ───────────────────────────────────────────────────
    getPipelines: (opts?) =>
      withCache(accountId, "opportunities:pipelines", {}, opts, (cacheOpts) =>
        getPipelines(cacheOpts),
      ),
    getOpportunities: (params?, opts?) =>
      withCache(accountId, "opportunities:list", params, opts, (cacheOpts) =>
        getOpportunities(params, cacheOpts),
      ),
    getOpportunity: (opportunityId, opts?) =>
      withCache(
        accountId,
        "opportunities:get",
        { opportunityId },
        opts,
        (cacheOpts) => getOpportunity(opportunityId, cacheOpts),
      ),

    // ── Conversations ───────────────────────────────────────────────────
    getConversations: (params?, opts?) =>
      withCache(accountId, "conversations:list", params, opts, (cacheOpts) =>
        getConversations(params, cacheOpts),
      ),
    getConversation: (conversationId, opts?) =>
      withCache(
        accountId,
        "conversations:get",
        { conversationId },
        opts,
        (cacheOpts) => getConversation(conversationId, cacheOpts),
      ),
    getMessages: (params, opts?) =>
      withCache(
        accountId,
        "conversations:messages",
        params,
        opts,
        (cacheOpts) => getMessages(params, cacheOpts),
      ),

    // ── Calendars ───────────────────────────────────────────────────────
    getCalendars: (opts?) =>
      withCache(accountId, "appointments:calendars", {}, opts, (cacheOpts) =>
        getCalendars(cacheOpts),
      ),
    getCalendar: (calendarId, opts?) =>
      withCache(accountId, "appointments:calendar", { calendarId }, opts, (cacheOpts) =>
        getCalendar(calendarId, cacheOpts),
      ),
    getCalendarSlots: (params, opts?) =>
      withCache(accountId, "appointments:slots", params, opts, (cacheOpts) =>
        getCalendarSlots(params, cacheOpts),
      ),
    getAppointments: (params?, opts?) =>
      withCache(accountId, "appointments:list", params, opts, (cacheOpts) =>
        getAppointments(params, cacheOpts),
      ),
    getAppointment: (eventId, opts?) =>
      withCache(accountId, "appointments:get", { eventId }, opts, (cacheOpts) =>
        getAppointment(eventId, cacheOpts),
      ),
  };
}
