import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { callLog } from "../../mocks/handlers";
import {
  updateLog,
  createMockAccount,
  setMockAccount,
} from "../../mocks/supabase";
import { encryptToken } from "@/lib/ghl/token";
import { provisionGHL } from "@/lib/jobs/provisionGHL";

const ACCOUNT_ID = "acc_test_001";
const AGENCY_KEY = "test-agency-key-abc123";
const LOCATION_TOKEN = "mock-location-api-key-xyz";

describe("provisionGHL", () => {
  // ── Test 1: Happy path ────────────────────────────────────────────────

  it("provisions from step 0 to complete", async () => {
    setMockAccount(createMockAccount());

    await provisionGHL(ACCOUNT_ID);

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
    expect(webhookBody.secret).toBe("test-webhook-secret");
    expect(webhookBody.events).toHaveLength(9);

    // Verify DB updates
    // First update: step 1+2 combined (location + token + step=2)
    const step2Update = updateLog.find((u) => u.data.provisioning_step === 2);
    expect(step2Update).toBeDefined();
    expect(step2Update!.data.ghl_location_id).toBe("loc_mock_001");
    expect(step2Update!.data.ghl_sub_account_id).toBe("loc_mock_001");
    expect(step2Update!.data.ghl_token_encrypted).toBeDefined();

    // Final update: complete
    const finalUpdate = updateLog.find(
      (u) => u.data.provisioning_status === "complete",
    );
    expect(finalUpdate).toBeDefined();
    expect(finalUpdate!.data.provisioning_step).toBe(6);
    expect(finalUpdate!.data.onboarding_done_at).toBeDefined();
  });

  // ── Test 2: Idempotent resume from step 3 ─────────────────────────────

  it("resumes from step 3, skipping steps 1-3", async () => {
    const encryptedToken = encryptToken(LOCATION_TOKEN);

    setMockAccount(
      createMockAccount({
        provisioning_step: 3,
        ghl_location_id: "loc_mock_001",
        ghl_sub_account_id: "loc_mock_001",
        ghl_token_encrypted: encryptedToken,
      }),
    );

    await provisionGHL(ACCOUNT_ID);

    // Should only make 2 calls: GET /webhooks + POST /webhooks
    expect(callLog).toHaveLength(2);
    expect(callLog[0].method).toBe("GET");
    expect(callLog[0].url).toBe("/webhooks");
    expect(callLog[1].method).toBe("POST");
    expect(callLog[1].url).toBe("/webhooks");

    // Both use location auth, not agency auth
    expect(callLog[0].authHeader).toBe(`Bearer ${LOCATION_TOKEN}`);
    expect(callLog[1].authHeader).toBe(`Bearer ${LOCATION_TOKEN}`);

    // Should NOT have written ghl_location_id (step 1 was skipped)
    const locationUpdate = updateLog.find(
      (u) => u.data.ghl_location_id !== undefined,
    );
    expect(locationUpdate).toBeUndefined();

    // Should reach complete
    const finalUpdate = updateLog.find(
      (u) => u.data.provisioning_status === "complete",
    );
    expect(finalUpdate).toBeDefined();
    expect(finalUpdate!.data.provisioning_step).toBe(6);
  });

  // ── Test 3: Failure at step 4 ─────────────────────────────────────────

  it("writes error state when webhook registration fails", async () => {
    const encryptedToken = encryptToken(LOCATION_TOKEN);

    setMockAccount(
      createMockAccount({
        provisioning_step: 3,
        ghl_location_id: "loc_mock_001",
        ghl_sub_account_id: "loc_mock_001",
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

    await provisionGHL(ACCOUNT_ID);

    // Should have attempted GET /webhooks then POST /webhooks (which fails)
    expect(callLog).toHaveLength(2);

    // Should have written error state
    const errorUpdate = updateLog.find(
      (u) => u.data.provisioning_status === "error",
    );
    expect(errorUpdate).toBeDefined();
    expect(errorUpdate!.data.provisioning_error).toContain(
      "register_webhooks",
    );

    // Step should NOT have advanced to 4
    const step4Update = updateLog.find(
      (u) => u.data.provisioning_step === 4,
    );
    expect(step4Update).toBeUndefined();
  });
});
