import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GHLConversation } from "../ghl/types.ts";
import {
  conversationNeedsReply,
  filterConversationsForInbox,
  isConversationAiHandledLast,
  parseInboxFilterTab,
} from "./inboxFilters.ts";

function conv(partial: Partial<GHLConversation> & Pick<GHLConversation, "id" | "contactId">): GHLConversation {
  return {
    locationId: "loc",
    assignedTo: null,
    lastMessageBody: null,
    lastMessageDate: null,
    lastMessageType: null,
    lastMessageDirection: null,
    type: "TYPE_SMS",
    unreadCount: 0,
    starred: false,
    dateAdded: "",
    dateUpdated: "",
    ...partial,
  };
}

describe("parseInboxFilterTab", () => {
  it("maps known filters", () => {
    assert.equal(parseInboxFilterTab("unread"), "unread");
    assert.equal(parseInboxFilterTab("ai_handled"), "ai_handled");
    assert.equal(parseInboxFilterTab("needs_reply"), "needs_reply");
  });
  it("defaults to all", () => {
    assert.equal(parseInboxFilterTab(undefined), "all");
    assert.equal(parseInboxFilterTab("nope"), "all");
  });
});

describe("conversationNeedsReply", () => {
  const t0 = "2026-04-01T12:00:00.000Z";
  const now = new Date("2026-04-01T13:00:00.000Z").getTime();

  it("false when not unread", () => {
    assert.equal(conversationNeedsReply(0, "inbound", t0, now), false);
  });
  it("false when last outbound within 2h", () => {
    assert.equal(conversationNeedsReply(3, "outbound", t0, now), false);
  });
  it("true when unread and last outbound older than 2h", () => {
    const old = new Date("2026-04-01T09:00:00.000Z").toISOString();
    assert.equal(conversationNeedsReply(1, "outbound", old, now), true);
  });
  it("true when unread and last is inbound", () => {
    assert.equal(conversationNeedsReply(2, "inbound", t0, now), true);
  });
});

describe("isConversationAiHandledLast", () => {
  it("detects automation-like lastMessageSource", () => {
    assert.equal(
      isConversationAiHandledLast(
        conv({ id: "1", contactId: "c", lastMessageSource: "Workflow" }),
      ),
      true,
    );
  });
  it("false without source hint", () => {
    assert.equal(
      isConversationAiHandledLast(conv({ id: "1", contactId: "c", lastMessageSource: null })),
      false,
    );
  });
});

describe("filterConversationsForInbox", () => {
  const now = new Date("2026-04-01T15:00:00.000Z").getTime();
  const rows = [
    conv({ id: "a", contactId: "1", unreadCount: 1, lastMessageDirection: "inbound" }),
    conv({ id: "b", contactId: "2", unreadCount: 0, lastMessageSource: "automation" }),
  ];

  it("all returns input length", () => {
    assert.equal(filterConversationsForInbox(rows, "all", now).length, 2);
  });
  it("unread", () => {
    assert.deepEqual(
      filterConversationsForInbox(rows, "unread", now).map((r) => r.id),
      ["a"],
    );
  });
  it("ai_handled", () => {
    assert.deepEqual(
      filterConversationsForInbox(rows, "ai_handled", now).map((r) => r.id),
      ["b"],
    );
  });
});
