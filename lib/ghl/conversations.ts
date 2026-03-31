// ---------------------------------------------------------------------------
// GoHighLevel API v2 — Conversations Service
// Docs: https://marketplace.gohighlevel.com/docs/
// ---------------------------------------------------------------------------

import { ghlGet, ghlPost, type GHLClientOptions } from "./client";
import type {
  GHLConversationsListParams,
  GHLConversationsListResponse,
  GHLConversation,
  GHLMessagesListParams,
  GHLMessagesListResponse,
  GHLSendMessagePayload,
  GHLMessage,
  GHLCreateConversationPayload,
} from "./types";

// ── List conversations ─────────────────────────────────────────────────────

export function getConversations(
  params?: GHLConversationsListParams,
  opts?: GHLClientOptions,
) {
  const { locationId, ...rest } = params ?? {};
  return ghlGet<GHLConversationsListResponse>("/conversations/", {
    ...opts,
    locationId: locationId ?? opts?.locationId,
    params: rest as Record<string, string | number | boolean | undefined>,
  });
}

// ── Single conversation ────────────────────────────────────────────────────

export function getConversation(
  conversationId: string,
  opts?: GHLClientOptions,
) {
  return ghlGet<{ conversation: GHLConversation }>(
    `/conversations/${conversationId}`,
    opts,
  );
}

// ── Create conversation ────────────────────────────────────────────────────

export function createConversation(
  data: GHLCreateConversationPayload,
  opts?: GHLClientOptions,
) {
  return ghlPost<{ conversation: GHLConversation }>(
    "/conversations/",
    data,
    opts,
  );
}

// ── Messages ───────────────────────────────────────────────────────────────

export function getMessages(
  params: GHLMessagesListParams,
  opts?: GHLClientOptions,
) {
  const { conversationId, ...rest } = params;
  return ghlGet<GHLMessagesListResponse>(
    `/conversations/${conversationId}/messages`,
    {
      ...opts,
      params: rest as Record<string, string | number | boolean | undefined>,
    },
  );
}

// ── Send message ───────────────────────────────────────────────────────────

export function sendMessage(
  conversationId: string,
  data: GHLSendMessagePayload,
  opts?: GHLClientOptions,
) {
  return ghlPost<GHLMessage>(
    `/conversations/messages`,
    { ...data, conversationId },
    opts,
  );
}
