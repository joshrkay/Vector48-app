// ---------------------------------------------------------------------------
// MSW v2 Handlers — Mock GHL API endpoints for provisioning tests
// ---------------------------------------------------------------------------

import { http, HttpResponse } from "msw";

const GHL_BASE = "https://services.leadconnectorhq.com";

// ── Call log for assertions ───────────────────────────────────────────────

export interface CallLogEntry {
  method: string;
  url: string;
  authHeader: string | null;
  body: unknown;
}

export const callLog: CallLogEntry[] = [];

export function resetCallLog() {
  callLog.length = 0;
}

// ── Handlers ──────────────────────────────────────────────────────────────

export const handlers = [
  // Step 1: Create location (agency auth)
  http.post(`${GHL_BASE}/locations`, async ({ request }) => {
    const body = await request.json();
    callLog.push({
      method: "POST",
      url: "/locations",
      authHeader: request.headers.get("Authorization"),
      body,
    });

    return HttpResponse.json({
      location: {
        id: "loc_mock_001",
        companyId: (body as Record<string, unknown>).companyId ?? "test-agency-id",
        name: (body as Record<string, unknown>).name ?? "Test Business",
        phone: null,
        address: null,
        city: null,
        state: null,
        postalCode: null,
        country: null,
        timezone: (body as Record<string, unknown>).timezone ?? "America/New_York",
        website: null,
        email: null,
        apiKey: "mock-location-api-key-xyz",
        dateAdded: new Date().toISOString(),
      },
    });
  }),

  // Step 2b: Exchange agency token for location token
  http.post(`${GHL_BASE}/oauth/locationToken`, async ({ request }) => {
    const body = await request.json();
    callLog.push({
      method: "POST",
      url: "/oauth/locationToken",
      authHeader: request.headers.get("Authorization"),
      body,
    });

    return HttpResponse.json({
      access_token: "mock-location-api-key-xyz",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "location",
      locationId: (body as Record<string, unknown>).locationId ?? "loc_mock_001",
    });
  }),

  // Step 3: Update location settings (location auth)
  http.put(`${GHL_BASE}/locations/:locationId`, async ({ request, params }) => {
    const body = await request.json();
    callLog.push({
      method: "PUT",
      url: `/locations/${params.locationId}`,
      authHeader: request.headers.get("Authorization"),
      body,
    });

    return new HttpResponse(null, { status: 204 });
  }),

  // Step 4a: List webhooks (location auth, idempotency check)
  http.get(`${GHL_BASE}/webhooks`, ({ request }) => {
    callLog.push({
      method: "GET",
      url: "/webhooks",
      authHeader: request.headers.get("Authorization"),
      body: null,
    });

    return HttpResponse.json({ webhooks: [] });
  }),

  // Step 4b: Create webhook (location auth)
  http.post(`${GHL_BASE}/webhooks`, async ({ request }) => {
    const body = await request.json();
    callLog.push({
      method: "POST",
      url: "/webhooks",
      authHeader: request.headers.get("Authorization"),
      body,
    });

    return HttpResponse.json({
      webhook: {
        id: "wh_mock_001",
        locationId: (body as Record<string, unknown>).locationId ?? "loc_mock_001",
        url: (body as Record<string, unknown>).url ?? "",
        events: (body as Record<string, unknown>).events ?? [],
        active: true,
        dateAdded: new Date().toISOString(),
      },
    });
  }),
];
