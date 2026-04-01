import { describe, expect, it } from "vitest";
import { parseGHLWebhook } from "./webhookParser";

describe("parseGHLWebhook", () => {
  const cases: Array<{ type: string; payload: Record<string, unknown>; expectedEventType: string }> = [
    {
      type: "ContactCreate",
      expectedEventType: "contact_created",
      payload: {
        id: "contact-1",
        location_id: "loc-1",
        firstName: "Ada",
        token: "should-strip",
      },
    },
    {
      type: "ContactUpdate",
      expectedEventType: "contact_updated",
      payload: {
        id: "contact-2",
        dateUpdated: "2026-03-31T10:00:00.000Z",
        contact: { name: "Updated Person", phone: "+15550001111" },
      },
    },
    {
      type: "CallCompleted",
      expectedEventType: "call_completed",
      payload: {
        id: "call-1",
        contact: { id: "contact-3", firstName: "Callie" },
        duration: 125,
        direction: "inbound",
      },
    },
    {
      type: "InboundMessage",
      expectedEventType: "message_received",
      payload: {
        id: "msg-1",
        contact_id: "contact-4",
        message: "Hello there from inbound message",
        webhookToken: "strip-me",
      },
    },
    {
      type: "OpportunityCreate",
      expectedEventType: "opportunity_created",
      payload: {
        opportunityId: "opp-1",
        name: "Website Redesign",
        monetaryValue: 8000,
        contact: { id: "contact-5", name: "Buyer" },
      },
    },
    {
      type: "OpportunityStageUpdate",
      expectedEventType: "opportunity_moved",
      payload: {
        opportunityId: "opp-2",
        pipeline: { stage: { name: "Qualified" } },
        contact: { id: "contact-6", name: "Mover" },
      },
    },
    {
      type: "AppointmentCreate",
      expectedEventType: "appointment_created",
      payload: {
        appointmentId: "apt-1",
        appointmentTime: "2026-04-02T16:30:00.000Z",
        contact: { id: "contact-7", firstName: "Booked" },
      },
    },
    {
      type: "AppointmentStatusUpdate",
      expectedEventType: "appointment_updated",
      payload: {
        appointmentId: "apt-2",
        start_time: "2026-04-05T19:00:00.000Z",
        appointmentStatus: "confirmed",
        contact: { id: "contact-8", name: "Status Person" },
      },
    },
    {
      type: "ConversationUnreadUpdate",
      expectedEventType: "conversation_unread",
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

      expect(parsed.event_type).toBe(testCase.expectedEventType);
      expect(parsed.ghl_event_type).toBe(testCase.type);
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
        type: "InboundMessage",
        id: "msg-2",
        contact: { id: "nested-1", phone: "+15559990000", name: "Nested Contact" },
      },
      "InboundMessage"
    );

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

    expect(parsed.detail.location_id).toBe("loc-xyz");
    expect(parsed.detail.token).toBeUndefined();
  });
});
