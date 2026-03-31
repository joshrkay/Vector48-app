// ---------------------------------------------------------------------------
// GoHighLevel API v2 — Contacts Service
// Docs: https://marketplace.gohighlevel.com/docs/
// ---------------------------------------------------------------------------

import { ghlGet, ghlPost, ghlPut, ghlDelete, type GHLClientOptions } from "./client";
import type {
  GHLContactsListParams,
  GHLContactsListResponse,
  GHLContactResponse,
  GHLCreateContactPayload,
  GHLUpdateContactPayload,
  GHLContactNote,
  GHLContactTask,
} from "./types";

// ── List / Search ──────────────────────────────────────────────────────────

export function getContacts(
  params?: GHLContactsListParams,
  opts?: GHLClientOptions,
) {
  const { locationId, ...rest } = params ?? {};
  return ghlGet<GHLContactsListResponse>("/contacts/", {
    ...opts,
    locationId: locationId ?? opts?.locationId,
    params: rest as Record<string, string | number | boolean | undefined>,
  });
}

// ── Single contact ─────────────────────────────────────────────────────────

export function getContact(contactId: string, opts?: GHLClientOptions) {
  return ghlGet<GHLContactResponse>(`/contacts/${contactId}`, opts);
}

// ── Create ─────────────────────────────────────────────────────────────────

export function createContact(
  data: GHLCreateContactPayload,
  opts?: GHLClientOptions,
) {
  return ghlPost<GHLContactResponse>("/contacts/", data, opts);
}

// ── Update ─────────────────────────────────────────────────────────────────

export function updateContact(
  contactId: string,
  data: GHLUpdateContactPayload,
  opts?: GHLClientOptions,
) {
  return ghlPut<GHLContactResponse>(`/contacts/${contactId}`, data, opts);
}

// ── Delete ─────────────────────────────────────────────────────────────────

export function deleteContact(contactId: string, opts?: GHLClientOptions) {
  return ghlDelete(`/contacts/${contactId}`, opts);
}

// ── Tags ───────────────────────────────────────────────────────────────────

export function addContactTag(
  contactId: string,
  tags: string[],
  opts?: GHLClientOptions,
) {
  return ghlPost<GHLContactResponse>(`/contacts/${contactId}/tags`, { tags }, opts);
}

export function removeContactTag(
  contactId: string,
  tags: string[],
  opts?: GHLClientOptions,
) {
  return ghlDelete(`/contacts/${contactId}/tags`, {
    ...opts,
  } as GHLClientOptions);
}

// ── Notes ──────────────────────────────────────────────────────────────────

export function getContactNotes(
  contactId: string,
  opts?: GHLClientOptions,
) {
  return ghlGet<{ notes: GHLContactNote[] }>(`/contacts/${contactId}/notes`, opts);
}

export function addContactNote(
  contactId: string,
  body: string,
  opts?: GHLClientOptions,
) {
  return ghlPost<GHLContactNote>(`/contacts/${contactId}/notes`, { body }, opts);
}

// ── Tasks ──────────────────────────────────────────────────────────────────

export function getContactTasks(
  contactId: string,
  opts?: GHLClientOptions,
) {
  return ghlGet<{ tasks: GHLContactTask[] }>(`/contacts/${contactId}/tasks`, opts);
}

export function addContactTask(
  contactId: string,
  data: { title: string; body?: string; dueDate: string; assignedTo?: string },
  opts?: GHLClientOptions,
) {
  return ghlPost<GHLContactTask>(`/contacts/${contactId}/tasks`, data, opts);
}
