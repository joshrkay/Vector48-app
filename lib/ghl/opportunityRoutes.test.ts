import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAccountForUser = vi.fn();
const getAccountGhlCredentials = vi.fn();
const createOpportunity = vi.fn();
const updateOpportunity = vi.fn();
const updateOpportunityStatus = vi.fn();
const addContactNote = vi.fn();
const createServerClient = vi.fn();
const invalidateGHLCache = vi.fn();

vi.mock("@/lib/auth/account", () => ({
  requireAccountForUser,
}));

vi.mock("@/lib/ghl", () => ({
  getAccountGhlCredentials,
}));

vi.mock("@/lib/ghl/opportunities", () => ({
  createOpportunity,
  updateOpportunity,
  updateOpportunityStatus,
}));

vi.mock("@/lib/ghl/contacts", () => ({
  addContactNote,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient,
}));

vi.mock("@/lib/ghl/cacheInvalidation", () => ({
  invalidateGHLCache,
}));

describe("GHL opportunity routes", () => {
  beforeEach(() => {
    vi.resetModules();
    requireAccountForUser.mockReset();
    getAccountGhlCredentials.mockReset();
    createOpportunity.mockReset();
    updateOpportunity.mockReset();
    updateOpportunityStatus.mockReset();
    addContactNote.mockReset();
    createServerClient.mockReset();
    invalidateGHLCache.mockReset();

    createServerClient.mockResolvedValue({});
    requireAccountForUser.mockResolvedValue({ accountId: "acct-1" });
    getAccountGhlCredentials.mockResolvedValue({
      locationId: "loc-1",
      accessToken: "token-1",
    });
    addContactNote.mockResolvedValue(undefined);
  });

  it("rejects invalid create payloads", async () => {
    const { POST } = await import("@/app/api/ghl/opportunities/route");

    const response = await POST(
      new Request("https://example.com/api/ghl/opportunities", {
        method: "POST",
        body: JSON.stringify({
          contactId: "",
          pipelineId: "pipeline-1",
          pipelineStageId: "stage-1",
          jobType: "",
        }),
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(createOpportunity).not.toHaveBeenCalled();
    expect(invalidateGHLCache).not.toHaveBeenCalled();
  });

  it("creates an opportunity and invalidates cache", async () => {
    createOpportunity.mockResolvedValue({ id: "opp-1" });
    const { POST } = await import("@/app/api/ghl/opportunities/route");

    const response = await POST(
      new Request("https://example.com/api/ghl/opportunities", {
        method: "POST",
        body: JSON.stringify({
          contactId: "contact-1",
          pipelineId: "pipeline-1",
          pipelineStageId: "stage-1",
          jobType: "AC replacement",
          monetaryValue: "9500",
          notes: "Urgent",
        }),
      }) as never,
    );

    expect(response.status).toBe(201);
    expect(createOpportunity).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "contact-1",
        pipelineId: "pipeline-1",
        pipelineStageId: "stage-1",
        name: "AC replacement",
        monetaryValue: 9500,
      }),
      { locationId: "loc-1", apiKey: "token-1" },
    );
    expect(addContactNote).toHaveBeenCalled();
    expect(invalidateGHLCache).toHaveBeenCalledWith("acct-1", "OpportunityCreate", {
      invalidateInMemoryFallback: true,
    });
  });

  it("updates an opportunity stage and invalidates cache", async () => {
    updateOpportunity.mockResolvedValue({ id: "opp-1", pipelineStageId: "stage-2" });
    const { PATCH } = await import("@/app/api/ghl/opportunities/[id]/route");

    const response = await PATCH(
      new Request("https://example.com/api/ghl/opportunities/opp-1", {
        method: "PATCH",
        body: JSON.stringify({ pipelineStageId: "stage-2" }),
      }) as never,
      { params: Promise.resolve({ id: "opp-1" }) },
    );

    expect(response.status).toBe(200);
    expect(updateOpportunity).toHaveBeenCalledWith(
      "opp-1",
      { pipelineStageId: "stage-2" },
      { locationId: "loc-1", apiKey: "token-1" },
    );
    expect(invalidateGHLCache).toHaveBeenCalledWith("acct-1", "OpportunityStageUpdate", {
      invalidateInMemoryFallback: true,
    });
  });

  it("rejects invalid close status payloads", async () => {
    const { PATCH } = await import("@/app/api/ghl/opportunities/[id]/status/route");

    const response = await PATCH(
      new Request("https://example.com/api/ghl/opportunities/opp-1/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "abandoned" }),
      }) as never,
      { params: Promise.resolve({ id: "opp-1" }) },
    );

    expect(response.status).toBe(400);
    expect(updateOpportunityStatus).not.toHaveBeenCalled();
    expect(invalidateGHLCache).not.toHaveBeenCalled();
  });

  it("closes an opportunity and invalidates cache", async () => {
    updateOpportunityStatus.mockResolvedValue({ id: "opp-1", status: "won" });
    const { PATCH } = await import("@/app/api/ghl/opportunities/[id]/status/route");

    const response = await PATCH(
      new Request("https://example.com/api/ghl/opportunities/opp-1/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "won" }),
      }) as never,
      { params: Promise.resolve({ id: "opp-1" }) },
    );

    expect(response.status).toBe(200);
    expect(updateOpportunityStatus).toHaveBeenCalledWith(
      "opp-1",
      "won",
      { locationId: "loc-1", apiKey: "token-1" },
    );
    expect(invalidateGHLCache).toHaveBeenCalledWith("acct-1", "OpportunityStatusUpdate", {
      invalidateInMemoryFallback: true,
    });
  });
});
