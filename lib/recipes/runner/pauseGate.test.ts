import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractContactId,
  isContactPaused,
  type PauseGateSupabaseClient,
} from "./pauseGate.ts";

function fakeSupabase(
  row: { config: Record<string, unknown> | null } | null,
): PauseGateSupabaseClient {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({ data: row, error: null }),
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe("extractContactId", () => {
  it("reads trigger_data.contact_id", () => {
    assert.equal(
      extractContactId({ account_id: "a", trigger_data: { contact_id: "c1" } }),
      "c1",
    );
  });

  it("reads call.contact.id for call triggers", () => {
    assert.equal(extractContactId({ call: { contact: { id: "c2" } } }), "c2");
  });

  it("falls back to call.contact.contactId", () => {
    assert.equal(
      extractContactId({ call: { contact: { contactId: "c3" } } }),
      "c3",
    );
  });

  it("returns null for schedule-driven triggers", () => {
    assert.equal(extractContactId({ campaign: "seasonal" }), null);
    assert.equal(extractContactId({}), null);
    assert.equal(extractContactId(null), null);
  });

  it("ignores empty-string contact ids", () => {
    assert.equal(
      extractContactId({ trigger_data: { contact_id: "" } }),
      null,
    );
  });
});

describe("isContactPaused", () => {
  it("returns true when the contact id is in paused_contact_ids", async () => {
    const paused = await isContactPaused(
      "acct",
      "review-request",
      "contact-42",
      fakeSupabase({ config: { paused_contact_ids: ["contact-7", "contact-42"] } }),
    );
    assert.equal(paused, true);
  });

  it("returns false when the list is empty", async () => {
    const paused = await isContactPaused(
      "acct",
      "review-request",
      "contact-42",
      fakeSupabase({ config: { paused_contact_ids: [] } }),
    );
    assert.equal(paused, false);
  });

  it("returns false when config has no paused_contact_ids key", async () => {
    const paused = await isContactPaused(
      "acct",
      "review-request",
      "contact-42",
      fakeSupabase({ config: { someOtherField: 1 } }),
    );
    assert.equal(paused, false);
  });

  it("returns false when there is no activation row", async () => {
    const paused = await isContactPaused(
      "acct",
      "review-request",
      "contact-42",
      fakeSupabase(null),
    );
    assert.equal(paused, false);
  });

  it("fails open on read errors", async () => {
    const client: PauseGateSupabaseClient = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      maybeSingle: async () => ({
                        data: null,
                        error: { message: "boom" },
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
    const paused = await isContactPaused("a", "r", "c", client);
    assert.equal(paused, false);
  });
});
