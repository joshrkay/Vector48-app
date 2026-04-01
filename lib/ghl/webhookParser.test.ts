import { describe, expect, it } from "vitest";
import { parseGHLWebhook } from "./webhookParser";

describe("parseGHLWebhook", () => {
  const cases: Array<{ type: string; payload: Record<string, unknown>; expectedEventType: string }> = [
    {
      type: "ContactCreate",
      expectedEventType: "lead_created",
      payload: {
        id: "contact-1",
        location_id: "loc-1",
        firstName: "Ada",
        token: "should-strip",
      },
    },
    {
      type: "OpportunityCreate",
      expectedEventType: "lead_created",
      payload: {
        opportunityId: "opp-1",
        name: "Website Redesign",
        monetaryValue: 8000,
        contact: { id: "contact-5", name: "Buyer" },
      },
    },
    {
      type: "AppointmentCreate",
      expectedEventType: "appointment_confirmed",
      payload: {
        appointmentId: "apt-1",
        appointmentTime: "2026-04-02T16:30:00.000Z",
        contact: { id: "contact-7", firstName: "Booked" },
      },
    },
    {
      type: "AppointmentStatusUpdate",
      expectedEventType: "alert",
      payload: {
        appointmentId: "apt-2",
        start_time: "2026-04-05T19:00:00.000Z",
        appointmentStatus: "cancelled",
        contact: { id: "contact-8", name: "Status Person" },
      },
    },
    {
      type: "ConversationUnreadUpdate",
      expectedEventType: "lead_outreach_sent",
      payload: {
        conversationId: "conv-1",
        unreadCount: 2,
        contact: { id: "contact-9", firstName: "Unread" },
        verificationToken: "strip-this-too",
      },
    },
  ];

  for (const testCase of cases) {
    it(`parses ${testCase.type} with fallback fields`, () => {
      const parsed = parseGHLWebhook(testCase.payload, testCase.type);

      expect(parsed).not.toBeNull();
      if (!parsed) {
        throw new Error("Expected parsed webhook");
      }

      expect(parsed.event_type).toBe(testCase.expectedEventType);
      expect(parsed.ghl_event_type).toBe(testCase.type);
      expect(parsed.recipe_slug).toBe("system");
      expect(parsed.summary.length).toBeGreaterThan(0);
      expect(parsed.summary.includes("\n")).toBe(false);
      expect(parsed.detail.token).toBeUndefined();
      expect(parsed.detail.webhookToken).toBeUndefined();
      expect(parsed.detail.verificationToken).toBeUndefined();
    });
  }

  it("uses nested contact id as fallback", () => {
    const parsed = parseGHLWebhook(
      {
        type: "ConversationUnread",
        conversationId: "conv-2",
        contact: { id: "nested-1", phone: "+15559990000", name: "Nested Contact" },
      },
      "ConversationUnread"
    );

    expect(parsed).not.toBeNull();
    if (!parsed) {
      throw new Error("Expected parsed webhook");
    }

    expect(parsed.contact_id).toBe("nested-1");
    expect(parsed.contact_phone).toBe("+15559990000");
    expect(parsed.contact_name).toBe("Nested Contact");
  });

  it("preserves location_id while sanitizing secrets", () => {
    const parsed = parseGHLWebhook(
      {
        type: "ContactCreate",
        id: "contact-10",
        location_id: "loc-xyz",
        token: "secret",
      },
      "ContactCreate"
    );

    expect(parsed).not.toBeNull();
    if (!parsed) {
      throw new Error("Expected parsed webhook");
    }

    expect(parsed.detail.location_id).toBe("loc-xyz");
    expect(parsed.detail.token).toBeUndefined();
  });

  it("returns null for unsupported webhook events", () => {
    const parsed = parseGHLWebhook(
      {
        type: "ContactUpdate",
        id: "contact-2",
      },
      "ContactUpdate"
    );

    expect(parsed).toBeNull();
  });

  it("returns null for non-cancelled appointment status updates", () => {
    const parsed = parseGHLWebhook(
      {
        type: "AppointmentStatusUpdate",
        appointmentStatus: "confirmed",
      },
      "AppointmentStatusUpdate"
    );

    expect(parsed).toBeNull();
  });
});
