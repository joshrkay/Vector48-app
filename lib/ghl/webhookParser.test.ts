import { describe, expect, it } from "vitest";
import { parseGHLWebhook } from "./webhookParser";

describe("parseGHLWebhook", () => {
  it("normalizes all supported webhook event types", () => {
    const cases: Array<{
      type: string;
      payload: Record<string, unknown>;
      eventType: string;
      summary: string;
    }> = [
      {
        type: "CallCompleted",
        eventType: "call_completed",
        summary: "Call completed with Sarah J. — 4 min, inbound",
        payload: {
          type: "CallCompleted",
          callId: "call-1",
          location_id: "loc-1",
          duration: 240,
          direction: "Inbound",
          notes: "Caller sounded frustrated",
          contact: { id: "contact-1", name: "Sarah J.", phone: "+16025550123" },
        },
      },
      {
        type: "InboundMessage",
        eventType: "message_received",
        summary: `New message from (602) 555-9876 — "My AC isn't cooling"`,
        payload: {
          type: "InboundMessage",
          conversationId: "conv-1",
          body: "My AC isn't cooling",
          contact: { id: "contact-2", phone: "6025559876" },
        },
      },
      {
        type: "ContactCreate",
        eventType: "contact_created",
        summary: "New contact: Mike Thompson, (602) 555-1234",
        payload: {
          type: "ContactCreate",
          id: "contact-3",
          firstName: "Mike",
          lastName: "Thompson",
          phone: "6025551234",
          source: "facebook",
          token: "secret",
        },
      },
      {
        type: "ContactUpdate",
        eventType: "contact_updated",
        summary: "Contact updated: Mike Thompson, (602) 555-1234",
        payload: {
          type: "ContactUpdate",
          id: "contact-3",
          firstName: "Mike",
          lastName: "Thompson",
          phone: "6025551234",
        },
      },
      {
        type: "OpportunityCreate",
        eventType: "opportunity_created",
        summary: "Opportunity created: AC replacement for Maria T.",
        payload: {
          type: "OpportunityCreate",
          opportunityId: "opp-1",
          name: "AC replacement",
          contact: { id: "contact-4", name: "Maria T." },
        },
      },
      {
        type: "OpportunityStageUpdate",
        eventType: "opportunity_moved",
        summary: "Lead moved to 'Quoted' stage — AC replacement for Maria T.",
        payload: {
          type: "OpportunityStageUpdate",
          opportunityId: "opp-2",
          name: "AC replacement",
          stageName: "Quoted",
          contact: { id: "contact-4", name: "Maria T." },
        },
      },
      {
        type: "AppointmentCreate",
        eventType: "appointment_created",
        summary: "Appointment created: David W., Apr 2, 4:30 PM",
        payload: {
          type: "AppointmentCreate",
          appointmentId: "apt-1",
          appointmentTime: "2026-04-02T16:30:00.000Z",
          contact: { id: "contact-5", name: "David W." },
        },
      },
      {
        type: "AppointmentStatusUpdate",
        eventType: "appointment_updated",
        summary: "Appointment cancelled: David W., Apr 5, 7:00 PM",
        payload: {
          type: "AppointmentStatusUpdate",
          appointmentId: "apt-2",
          appointmentStatus: "cancelled",
          start_time: "2026-04-05T19:00:00.000Z",
          contact: { id: "contact-5", name: "David W." },
        },
      },
      {
        type: "ConversationUnreadUpdate",
        eventType: "conversation_unread",
        summary: "Conversation has unread messages from Unread Person",
        payload: {
          type: "ConversationUnreadUpdate",
          conversationId: "conv-2",
          unreadCount: 2,
          contact: { id: "contact-6", name: "Unread Person" },
          verificationToken: "strip-me",
        },
      },
    ];

    for (const testCase of cases) {
      const parsed = parseGHLWebhook(testCase.payload, testCase.type);

      expect(parsed).not.toBeNull();
      expect(parsed).toMatchObject({
        recipe_slug: null,
        event_type: testCase.eventType,
        ghl_event_type: testCase.type,
        summary: testCase.summary,
      });
      expect(parsed?.detail.token).toBeUndefined();
      expect(parsed?.detail.verificationToken).toBeUndefined();
      expect(parsed?.detail.webhookToken).toBeUndefined();
    }
  });

  it("preserves metadata in detail while sanitizing secrets", () => {
    const parsed = parseGHLWebhook(
      {
        type: "ContactCreate",
        id: "contact-10",
        location_id: "loc-xyz",
        source: "referral",
        token: "secret",
      },
      "ContactCreate",
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.detail.location_id).toBe("loc-xyz");
    expect(parsed?.detail.source).toBe("referral");
    expect(parsed?.detail.token).toBeUndefined();
  });

  it("uses nested contact fields as fallbacks", () => {
    const parsed = parseGHLWebhook(
      {
        type: "InboundMessage",
        conversationId: "conv-3",
        message: "Need help",
        contact: { id: "nested-1", phone: "+15559990000", firstName: "Nested" },
      },
      "InboundMessage",
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.contact_id).toBe("nested-1");
    expect(parsed?.contact_phone).toBe("(555) 999-0000");
    expect(parsed?.contact_name).toBe("Nested");
  });

  it("generates deterministic ghl_event_id values for identical payloads", () => {
    const payload = {
      type: "ContactUpdate",
      id: "contact-22",
      phone: "6025550000",
      tags: ["vip"],
    };

    const first = parseGHLWebhook(payload, "ContactUpdate");
    const second = parseGHLWebhook(payload, "ContactUpdate");

    expect(first?.ghl_event_id).toBe(second?.ghl_event_id);
  });

  it("returns null for unsupported webhook events", () => {
    const parsed = parseGHLWebhook(
      {
        type: "UnknownEvent",
        id: "contact-2",
      },
      "UnknownEvent",
    );

    expect(parsed).toBeNull();
  });
});
