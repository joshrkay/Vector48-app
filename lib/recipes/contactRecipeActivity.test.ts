import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RecipeActivationRow } from "./phoneActivationMatch.ts";
import { getRecipeActivityForContact } from "./contactRecipeActivity.ts";

function activation(partial: Partial<RecipeActivationRow>): RecipeActivationRow {
  return {
    id: "ra-1",
    account_id: "acct-1",
    recipe_slug: "ai-follow-up",
    status: "active",
    config: { phone: "+1 (555) 010-0000" },
    n8n_workflow_id: null,
    activated_at: "2026-04-01T12:00:00.000Z",
    last_triggered_at: null,
    deactivated_at: null,
    error_message: null,
    ...partial,
  };
}

describe("getRecipeActivityForContact", () => {
  it("marks a contact active when the phone matches an active recipe activation", async () => {
    const supabase = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  eq: async () => ({
                    data: [activation({ recipe_slug: "follow-up-1" })],
                    error: null,
                  }),
                };
              },
            };
          },
        };
      },
    };

    const activity = await getRecipeActivityForContact({
      accountId: "acct-1",
      contactId: "contact-1",
      supabase,
      ghlCredentials: { locationId: "loc-1", accessToken: "token-1" },
      fetchContact: async () => ({
        contact: {
          phone: "+1 (555) 010-0000",
        },
      }),
    });

    assert.deepEqual(activity, {
      active: true,
      recipeSlugs: ["follow-up-1"],
    });
  });

  it("returns inactive when no activation matches the contact phone", async () => {
    const supabase = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  eq: async () => ({
                    data: [activation({ config: { phone: "+1 (555) 999-9999" } })],
                    error: null,
                  }),
                };
              },
            };
          },
        };
      },
    };

    const activity = await getRecipeActivityForContact({
      accountId: "acct-1",
      contactId: "contact-1",
      supabase,
      ghlCredentials: { locationId: "loc-1", accessToken: "token-1" },
      fetchContact: async () => ({
        contact: {
          phone: "5550100000",
        },
      }),
    });

    assert.deepEqual(activity, {
      active: false,
      recipeSlugs: [],
    });
  });
});
