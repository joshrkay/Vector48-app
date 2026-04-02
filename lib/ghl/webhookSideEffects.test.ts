import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomationEventInsert } from "./webhookTypes";

type RecipeActivation = {
  id: string;
  account_id: string;
  recipe_slug: string;
  status: "active" | "paused" | "error" | "deactivated";
};

type RecipeTrigger = {
  id: string;
  account_id: string;
  recipe_slug: string;
  ghl_event_type: string;
  contact_id: string | null;
  fire_at: string;
  fired: boolean;
  payload: Record<string, unknown> | null;
};

type AutomationEvent = {
  account_id: string;
  recipe_slug: string | null;
  event_type: string;
  ghl_event_type: string | null;
  ghl_event_id: string | null;
  contact_id: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  summary: string;
  detail: Record<string, unknown>;
};

function createQuery<T extends Record<string, unknown>>(
  rows: T[],
  type: "select" | "delete",
  onDelete?: (remaining: T[]) => void,
  shouldFailDelete = false,
) {
  const filters: Array<(row: T) => boolean> = [];

  const execute = async () => {
    const matching = rows.filter((row) => filters.every((filter) => filter(row)));

    if (type === "delete") {
      if (shouldFailDelete) {
        return { data: null, error: { message: "delete failed" } };
      }

      const remaining = rows.filter((row) => !filters.every((filter) => filter(row)));
      onDelete?.(remaining);
      return { data: matching, error: null };
    }

    return { data: matching, error: null };
  };

  const query = {
    eq(field: string, value: unknown) {
      filters.push((row) => row[field as keyof T] === value);
      return query;
    },
    in(field: string, values: unknown[]) {
      filters.push((row) => values.includes(row[field as keyof T]));
      return query;
    },
    then(onFulfilled: (value: { data: T[] | null; error: { message: string } | null }) => unknown) {
      return execute().then(onFulfilled);
    },
  };

  return query;
}

function createMockAdmin({
  recipeActivations = [],
  recipeTriggers = [],
  automationEvents = [],
  failDelete = false,
}: {
  recipeActivations?: RecipeActivation[];
  recipeTriggers?: RecipeTrigger[];
  automationEvents?: AutomationEvent[];
  failDelete?: boolean;
}) {
  const state = {
    recipeActivations: [...recipeActivations],
    recipeTriggers: [...recipeTriggers],
    automationEvents: [...automationEvents],
  };

  const client = {
    from(table: string) {
      if (table === "recipe_activations") {
        return {
          select() {
            return createQuery(state.recipeActivations, "select");
          },
        };
      }

      if (table === "recipe_triggers") {
        return {
          select() {
            return createQuery(state.recipeTriggers, "select");
          },
          delete() {
            return createQuery(
              state.recipeTriggers,
              "delete",
              (remaining) => {
                state.recipeTriggers = remaining as RecipeTrigger[];
              },
              failDelete,
            );
          },
          insert(row: RecipeTrigger) {
            state.recipeTriggers.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === "automation_events") {
        return {
          insert(row: AutomationEvent) {
            state.automationEvents.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { client, state };
}

let adminClient: ReturnType<typeof createMockAdmin>["client"];

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => adminClient,
  createAdminClient: () => adminClient,
}));

const baseEvent: AutomationEventInsert = {
  account_id: "acct-1",
  recipe_slug: null,
  event_type: "message_received",
  ghl_event_type: "InboundMessage",
  ghl_event_id: "InboundMessage:event-1",
  contact_id: "contact-1",
  contact_phone: "(602) 555-1234",
  contact_name: "Mike Thompson",
  summary: "New message from Mike Thompson",
  detail: {},
};

describe("processSideEffects", () => {
  beforeEach(() => {
    adminClient = createMockAdmin({}).client;
  });

  it("pauses matching active follow-up triggers on inbound reply", async () => {
    const mock = createMockAdmin({
      recipeActivations: [
        { id: "ra-1", account_id: "acct-1", recipe_slug: "estimate-follow-up", status: "active" },
        { id: "ra-2", account_id: "acct-1", recipe_slug: "appointment-rebooking", status: "paused" },
      ],
      recipeTriggers: [
        {
          id: "rt-1",
          account_id: "acct-1",
          recipe_slug: "estimate-follow-up",
          ghl_event_type: "OpportunityCreate",
          contact_id: "contact-1",
          fire_at: "2026-04-01T12:00:00.000Z",
          fired: false,
          payload: null,
        },
        {
          id: "rt-2",
          account_id: "acct-1",
          recipe_slug: "appointment-reminder",
          ghl_event_type: "AppointmentCreate",
          contact_id: "contact-1",
          fire_at: "2026-04-01T12:00:00.000Z",
          fired: false,
          payload: null,
        },
      ],
    });
    adminClient = mock.client;

    const { processSideEffects } = await import("./webhookSideEffects");
    await processSideEffects("acct-1", baseEvent, {
      contactId: "contact-1",
    });

    expect(mock.state.recipeTriggers.map((trigger) => trigger.id)).toEqual(["rt-2"]);
    expect(mock.state.automationEvents).toHaveLength(1);
    expect(mock.state.automationEvents[0]).toMatchObject({
      event_type: "sequence_paused",
      recipe_slug: "estimate-follow-up",
    });
    expect(mock.state.automationEvents[0].detail).toMatchObject({
      trigger_ids: ["rt-1"],
      recipe_slugs: ["estimate-follow-up"],
    });
  });

  it("enqueues rebooking when a cancelled appointment hits an active rebooking recipe", async () => {
    const mock = createMockAdmin({
      recipeActivations: [
        { id: "ra-7", account_id: "acct-1", recipe_slug: "appointment-rebooking", status: "active" },
      ],
    });
    adminClient = mock.client;

    const { processSideEffects } = await import("./webhookSideEffects");
    await processSideEffects(
      "acct-1",
      {
        ...baseEvent,
        event_type: "appointment_updated",
        ghl_event_type: "AppointmentStatusUpdate",
      },
      {
        contactId: "contact-1",
        appointmentId: "apt-1",
        appointmentStatus: "cancelled",
      },
    );

    expect(mock.state.recipeTriggers).toHaveLength(1);
    expect(mock.state.recipeTriggers[0]).toMatchObject({
      recipe_slug: "appointment-rebooking",
      contact_id: "contact-1",
      ghl_event_type: "AppointmentStatusUpdate",
    });
    expect(mock.state.automationEvents[0]).toMatchObject({
      event_type: "rebook_triggered",
      recipe_slug: "appointment-rebooking",
    });
  });

  it("creates an unresolved alert for negative call sentiment", async () => {
    const mock = createMockAdmin({});
    adminClient = mock.client;

    const { processSideEffects } = await import("./webhookSideEffects");
    await processSideEffects(
      "acct-1",
      {
        ...baseEvent,
        event_type: "call_completed",
        ghl_event_type: "CallCompleted",
      },
      {
        notes: "Customer was angry about the delay",
      },
    );

    expect(mock.state.automationEvents[0]).toMatchObject({
      event_type: "alert",
      recipe_slug: null,
    });
    expect(mock.state.automationEvents[0].detail).toMatchObject({
      reason: "negative_sentiment_keywords",
      keywords: ["angry"],
      resolved: false,
    });
  });

  it("swallows side effect failures without throwing", async () => {
    const mock = createMockAdmin({
      recipeActivations: [
        { id: "ra-1", account_id: "acct-1", recipe_slug: "estimate-follow-up", status: "active" },
      ],
      recipeTriggers: [
        {
          id: "rt-1",
          account_id: "acct-1",
          recipe_slug: "estimate-follow-up",
          ghl_event_type: "OpportunityCreate",
          contact_id: "contact-1",
          fire_at: "2026-04-01T12:00:00.000Z",
          fired: false,
          payload: null,
        },
      ],
      failDelete: true,
    });
    adminClient = mock.client;

    const { processSideEffects } = await import("./webhookSideEffects");

    await expect(
      processSideEffects("acct-1", baseEvent, { contactId: "contact-1" }),
    ).resolves.toBeUndefined();
    expect(mock.state.recipeTriggers).toHaveLength(1);
  });
});
