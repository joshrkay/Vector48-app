import { beforeEach, describe, expect, it, vi } from "vitest";

const invalidateGHLCache = vi.fn();
const processSideEffects = vi.fn().mockResolvedValue(undefined);
const parseGHLWebhook = vi.fn();
const authenticateGhlWebhook = vi.fn();

let accountResult: { data: { id: string } | null; error: { message: string } | null };
let insertResult: { error: { code?: string; message: string; details?: string } | null };

const mockAdmin = {
  from(table: string) {
    if (table === "accounts") {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => accountResult,
              };
            },
          };
        },
      };
    }

    if (table === "automation_events") {
      return {
        insert: async () => insertResult,
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  },
};

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockAdmin,
  createAdminClient: () => mockAdmin,
}));

vi.mock("@/lib/ghl/cacheInvalidation", () => ({
  invalidateGHLCache,
}));

vi.mock("@/lib/ghl/webhookSideEffects", () => ({
  processSideEffects,
}));

vi.mock("@/lib/ghl/webhookParser", () => ({
  parseGHLWebhook,
}));

vi.mock("@/app/api/webhooks/ghl/signatureVerification", () => ({
  authenticateGhlWebhook,
}));

describe("GHL webhook route", () => {
  beforeEach(() => {
    accountResult = {
      data: { id: "acct-1" },
      error: null,
    };
    insertResult = { error: null };
    invalidateGHLCache.mockReset();
    processSideEffects.mockClear();
    parseGHLWebhook.mockReset();
    authenticateGhlWebhook.mockReset();
    authenticateGhlWebhook.mockReturnValue({ ok: true, algorithm: "ed25519" });
    parseGHLWebhook.mockReturnValue({
      recipe_slug: null,
      event_type: "message_received",
      ghl_event_type: "InboundMessage",
      ghl_event_id: "InboundMessage:event-1",
      contact_id: "contact-1",
      contact_phone: "(602) 555-1234",
      contact_name: "Mike Thompson",
      summary: "New message from Mike Thompson",
      detail: {},
    });
  });

  it("returns 401 when the signature is missing", async () => {
    authenticateGhlWebhook.mockReturnValue({
      ok: false,
      reason: "missing_signature",
    });
    const { POST } = await import("@/app/api/webhooks/ghl/route");

    const response = await POST(
      new Request("https://example.com/api/webhooks/ghl", {
        method: "POST",
        body: JSON.stringify({ type: "InboundMessage", locationId: "loc-1" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(parseGHLWebhook).not.toHaveBeenCalled();
  });

  it("returns 401 when the signature is invalid", async () => {
    authenticateGhlWebhook.mockReturnValue({
      ok: false,
      reason: "invalid_ed25519_signature",
    });
    const { POST } = await import("@/app/api/webhooks/ghl/route");

    const response = await POST(
      new Request("https://example.com/api/webhooks/ghl", {
        method: "POST",
        headers: { "x-ghl-signature": "bogus" },
        body: JSON.stringify({ type: "InboundMessage", locationId: "loc-1" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(parseGHLWebhook).not.toHaveBeenCalled();
  });

  it("returns 200 when no account is mapped for the location", async () => {
    accountResult = { data: null, error: null };
    const { POST } = await import("@/app/api/webhooks/ghl/route");

    const response = await POST(
      new Request("https://example.com/api/webhooks/ghl", {
        method: "POST",
        headers: { "x-ghl-signature": "valid-sig" },
        body: JSON.stringify({ type: "InboundMessage", locationId: "loc-unknown" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(parseGHLWebhook).not.toHaveBeenCalled();
  });

  it("writes once, invalidates cache, and triggers side effects on the first valid delivery", async () => {
    const { POST } = await import("@/app/api/webhooks/ghl/route");

    const response = await POST(
      new Request("https://example.com/api/webhooks/ghl", {
        method: "POST",
        headers: { "x-ghl-signature": "valid-sig" },
        body: JSON.stringify({ type: "InboundMessage", locationId: "loc-1" }),
      }),
    );

    await Promise.resolve();

    expect(response.status).toBe(200);
    expect(parseGHLWebhook).toHaveBeenCalled();
    expect(invalidateGHLCache).toHaveBeenCalledWith("acct-1", "InboundMessage", {
      invalidateInMemoryFallback: true,
    });
    expect(processSideEffects).toHaveBeenCalledWith(
      "acct-1",
      expect.objectContaining({
        account_id: "acct-1",
        ghl_event_id: "InboundMessage:event-1",
      }),
      expect.objectContaining({ type: "InboundMessage", locationId: "loc-1" }),
    );
  });

  it("treats duplicate deliveries as successful no-ops", async () => {
    insertResult = {
      error: {
        code: "23505",
        message: "duplicate key value violates unique constraint",
        details: "Key already exists in idx_automation_events_ghl_dedup",
      },
    };
    const { POST } = await import("@/app/api/webhooks/ghl/route");

    const response = await POST(
      new Request("https://example.com/api/webhooks/ghl", {
        method: "POST",
        headers: { "x-ghl-signature": "valid-sig" },
        body: JSON.stringify({ type: "InboundMessage", locationId: "loc-1" }),
      }),
    );

    await Promise.resolve();

    expect(response.status).toBe(200);
    expect(invalidateGHLCache).not.toHaveBeenCalled();
    expect(processSideEffects).not.toHaveBeenCalled();
  });
});
