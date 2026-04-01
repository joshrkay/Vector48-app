import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { callLog } from "../../mocks/handlers";
import {
  updateLog,
  insertLog,
  createMockAccount,
  setMockAccount,
} from "../../mocks/supabase";
import { encryptToken } from "@/lib/ghl";
import { provisionGHL } from "@/lib/jobs/provisionGHL";

const ACCOUNT_ID = "acc_test_001";
const AGENCY_KEY = "test-agency-key-abc123";
const LOCATION_TOKEN = "mock-location-api-key-xyz";

describe("provisionGHL", () => {
  // ── Test 1: Happy path ────────────────────────────────────────────────

  it("provisions from step 0 to complete", async () => {
    setMockAccount(createMockAccount());

    const result = await provisionGHL(ACCOUNT_ID);
    expect(result).toEqual({ success: true });

    // Should have made 4 GHL API calls
    expect(callLog).toHaveLength(4);

    // Call 1: POST /locations with agency auth
    expect(callLog[0].method).toBe("POST");
    expect(callLog[0].url).toBe("/locations");
    expect(callLog[0].authHeader).toBe(`Bearer ${AGENCY_KEY}`);
    expect((callLog[0].body as Record<string, unknown>).companyId).toBe(
      "test-agency-id",
    );
    expect((callLog[0].body as Record<string, unknown>).name).toBe(
      "Ace Plumbing Co",
    );
    expect((callLog[0].body as Record<string, unknown>).timezone).toBe(
      "America/Chicago",
    ); // "Dallas, TX" → TX → America/Chicago

    // Call 2: PUT /locations/{id} with location auth
    expect(callLog[1].method).toBe("PUT");
    expect(callLog[1].url).toBe("/locations/loc_mock_001");
    expect(callLog[1].authHeader).toBe(`Bearer ${LOCATION_TOKEN}`);

    // Call 3: GET /webhooks (idempotency check) with location auth
    expect(callLog[2].method).toBe("GET");
    expect(callLog[2].url).toBe("/webhooks");
    expect(callLog[2].authHeader).toBe(`Bearer ${LOCATION_TOKEN}`);

    // Call 4: POST /webhooks with location auth
    expect(callLog[3].method).toBe("POST");
    expect(callLog[3].url).toBe("/webhooks");
    expect(callLog[3].authHeader).toBe(`Bearer ${LOCATION_TOKEN}`);

    const webhookBody = callLog[3].body as Record<string, unknown>;
    expect(webhookBody.url).toBe(
      "https://test.vector48.com/api/webhooks/ghl",
    );
    expect(typeof webhookBody.secret).toBe("string");
    expect(webhookBody.events).toHaveLength(9);

    const step1Update = updateLog.find((u) => u.data.provisioning_step === 1);
    expect(step1Update).toBeDefined();
    expect(step1Update!.data.ghl_location_id).toBe("loc_mock_001");

    const step2Update = updateLog.find((u) => u.data.provisioning_step === 2);
    expect(step2Update).toBeDefined();
    expect(step2Update!.data.ghl_token_encrypted).toBeDefined();

    const finalUpdate = updateLog.find(
      (u) => u.data.ghl_provisioning_status === "complete",
    );
    expect(finalUpdate).toBeDefined();
    expect(finalUpdate!.data.provisioning_step).toBe(6);
    expect(finalUpdate!.data.onboarding_completed_at).toBeDefined();
    expect(finalUpdate!.data.onboarding_done_at).toBeDefined();
    expect(insertLog.some((entry) => entry.table === "automation_events")).toBe(true);
  });

  // ── Test 2: Retry after webhook failure skips create/token steps ──────

  it("resumes after step 3, skipping location creation and token storage", async () => {
    const encryptedToken = encryptToken(LOCATION_TOKEN);

    setMockAccount(
      createMockAccount({
        provisioning_step: 3,
        ghl_location_id: "loc_mock_001",
        ghl_token_encrypted: encryptedToken,
      }),
    );

    const result = await provisionGHL(ACCOUNT_ID);
    expect(result).toEqual({ success: true });

    expect(callLog).toHaveLength(3);
    expect(callLog[0].method).toBe("PUT");
    expect(callLog[0].url).toBe("/locations/loc_mock_001");
    expect(callLog[1].method).toBe("GET");
    expect(callLog[1].url).toBe("/webhooks");
    expect(callLog[2].method).toBe("POST");
    expect(callLog[2].url).toBe("/webhooks");

    expect(callLog[0].authHeader).toBe(`Bearer ${LOCATION_TOKEN}`);
    expect(callLog[1].authHeader).toBe(`Bearer ${LOCATION_TOKEN}`);
    expect(callLog[2].authHeader).toBe(`Bearer ${LOCATION_TOKEN}`);

    const locationUpdate = updateLog.find(
      (u) => u.data.ghl_location_id !== undefined,
    );
    expect(locationUpdate).toBeUndefined();

    const finalUpdate = updateLog.find(
      (u) => u.data.ghl_provisioning_status === "complete",
    );
    expect(finalUpdate).toBeDefined();
    expect(finalUpdate!.data.provisioning_step).toBe(6);
  });

  // ── Test 3: Existing location without token recovers via token exchange ──

  it("exchanges a location token when the location exists but the token was missing", async () => {
    setMockAccount(
      createMockAccount({
        provisioning_step: 1,
        ghl_location_id: "loc_mock_001",
        ghl_token_encrypted: null,
      }),
    );

    const result = await provisionGHL(ACCOUNT_ID);
    expect(result).toEqual({ success: true });

    expect(callLog[0].method).toBe("POST");
    expect(callLog[0].url).toBe("/oauth/locationToken");
    expect(callLog[0].authHeader).toBe(`Bearer ${AGENCY_KEY}`);

    const tokenUpdate = updateLog.find((u) => u.data.provisioning_step === 2);
    expect(tokenUpdate).toBeDefined();
    expect(tokenUpdate!.data.ghl_token_encrypted).toBeDefined();
  });

  // ── Test 4: Existing webhook is not duplicated ────────────────────────

  it("skips webhook creation when the same webhook is already registered", async () => {
    const encryptedToken = encryptToken(LOCATION_TOKEN);

    setMockAccount(
      createMockAccount({
        provisioning_step: 4,
        ghl_location_id: "loc_mock_001",
        ghl_token_encrypted: encryptedToken,
      }),
    );

    server.use(
      http.get("https://services.leadconnectorhq.com/webhooks", ({ request }) => {
        callLog.push({
          method: "GET",
          url: "/webhooks",
          authHeader: request.headers.get("Authorization"),
          body: null,
        });
        return HttpResponse.json({
          webhooks: [
            {
              id: "wh_mock_001",
              url: "https://test.vector48.com/api/webhooks/ghl",
              events: [
                "ContactCreate",
                "ContactUpdate",
                "ConversationUnreadUpdate",
                "OpportunityCreate",
                "OpportunityStageUpdate",
                "AppointmentCreate",
                "AppointmentStatusUpdate",
                "InboundMessage",
                "CallCompleted",
              ],
            },
          ],
        });
      }),
    );

    const result = await provisionGHL(ACCOUNT_ID);
    expect(result).toEqual({ success: true });

    expect(callLog).toHaveLength(2);
    expect(callLog[0].method).toBe("PUT");
    expect(callLog[1].method).toBe("GET");
  });

  // ── Test 5: Failure at step 4 ─────────────────────────────────────────

  it("writes error state when webhook registration fails", async () => {
    const encryptedToken = encryptToken(LOCATION_TOKEN);

    setMockAccount(
      createMockAccount({
        provisioning_step: 3,
        ghl_location_id: "loc_mock_001",
        ghl_token_encrypted: encryptedToken,
      }),
    );

    // Override POST /webhooks to return a 400 error (non-retryable)
    server.use(
      http.post(
        "https://services.leadconnectorhq.com/webhooks",
        async ({ request }) => {
          callLog.push({
            method: "POST",
            url: "/webhooks",
            authHeader: request.headers.get("Authorization"),
            body: await request.json(),
          });
          return HttpResponse.json(
            { statusCode: 400, message: "Bad request", error: "Validation" },
            { status: 400 },
          );
        },
      ),
    );

    const result = await provisionGHL(ACCOUNT_ID);
    expect(result.success).toBe(false);

    expect(callLog).toHaveLength(3);

    const errorUpdate = updateLog.find(
      (u) => u.data.ghl_provisioning_status === "failed",
    );
    expect(errorUpdate).toBeDefined();
    expect(errorUpdate!.data.ghl_provisioning_error).toContain(
      "register_webhooks",
    );

    const step4Update = updateLog.find(
      (u) => u.data.provisioning_step === 4,
    );
    expect(step4Update).toBeUndefined();
  });
});
