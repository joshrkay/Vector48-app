// ---------------------------------------------------------------------------
// GoHighLevel — Tier-Aware Caching Wrapper
// Wraps all GHL read methods with an in-memory cache whose TTL is determined
// by the account's pricing tier. Exports cachedGHLClient(accountId).
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
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  const sorted = Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce(
      (acc, key) => {
        const v = (value as Record<string, unknown>)[key];
        if (v !== undefined) acc[key] = v;
        return acc;
      },
      {} as Record<string, unknown>,
    );
  return JSON.stringify(sorted);
}

function buildCacheKey(
  accountId: string,
  resource: string,
  params?: unknown,
): string {
  const hash = params ? stableStringify(params) : "";
  return `ghl:${accountId}:${resource}:${hash}`;
}

// ── Generic cache wrapper ─────────────────────────────────────────────────

async function withCache<T>(
  accountId: string,
  resource: string,
  params: unknown,
  fetcher: () => Promise<T>,
): Promise<T> {
  const key = buildCacheKey(accountId, resource, params);

  const cached = cacheStore.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }

  const config = await getTierConfig(accountId);
  const data = await fetcher();

  cacheStore.set(key, {
    data,
    expiresAt: Date.now() + config.cacheTTL * 1_000,
  });
  ensureSweep();

  return data;
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
 * Returns a GHL client where every read method is wrapped with a tier-aware
 * in-memory cache. The cache TTL comes from the account's pricing_config.
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
      withCache(accountId, "contacts:list", params, () =>
        getContacts(params, opts),
      ),
    getContact: (contactId, opts?) =>
      withCache(accountId, "contacts:get", contactId, () =>
        getContact(contactId, opts),
      ),
    getContactNotes: (contactId, opts?) =>
      withCache(accountId, "contacts:notes", contactId, () =>
        getContactNotes(contactId, opts),
      ),
    getContactTasks: (contactId, opts?) =>
      withCache(accountId, "contacts:tasks", contactId, () =>
        getContactTasks(contactId, opts),
      ),

    // ── Opportunities ───────────────────────────────────────────────────
    getPipelines: (opts?) =>
      withCache(accountId, "opportunities:pipelines", null, () =>
        getPipelines(opts),
      ),
    getOpportunities: (params?, opts?) =>
      withCache(accountId, "opportunities:list", params, () =>
        getOpportunities(params, opts),
      ),
    getOpportunity: (opportunityId, opts?) =>
      withCache(accountId, "opportunities:get", opportunityId, () =>
        getOpportunity(opportunityId, opts),
      ),

    // ── Conversations ───────────────────────────────────────────────────
    getConversations: (params?, opts?) =>
      withCache(accountId, "conversations:list", params, () =>
        getConversations(params, opts),
      ),
    getConversation: (conversationId, opts?) =>
      withCache(accountId, "conversations:get", conversationId, () =>
        getConversation(conversationId, opts),
      ),
    getMessages: (params, opts?) =>
      withCache(accountId, "conversations:messages", params, () =>
        getMessages(params, opts),
      ),

    // ── Calendars ───────────────────────────────────────────────────────
    getCalendars: (opts?) =>
      withCache(accountId, "appointments:calendars", null, () =>
        getCalendars(opts),
      ),
    getCalendar: (calendarId, opts?) =>
      withCache(accountId, "appointments:calendar", calendarId, () =>
        getCalendar(calendarId, opts),
      ),
    getCalendarSlots: (params, opts?) =>
      withCache(accountId, "appointments:slots", params, () =>
        getCalendarSlots(params, opts),
      ),
    getAppointments: (params?, opts?) =>
      withCache(accountId, "appointments:list", params, () =>
        getAppointments(params, opts),
      ),
    getAppointment: (eventId, opts?) =>
      withCache(accountId, "appointments:get", eventId, () =>
        getAppointment(eventId, opts),
      ),
  };
}
