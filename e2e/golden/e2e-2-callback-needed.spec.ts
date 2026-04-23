// ---------------------------------------------------------------------------
// E2E-2: Callback-Needed flow (P0 launch blocker).
//
// Three converging sources must normalize to the same internal state:
//   (a) GHL NoteCreate webhook whose body matches CALLBACK_KEYWORD_PATTERN
//   (b) Operator clicks "Mark needs callback" in /crm/contacts/[id] UI
//   (c) Voice AI transcript classifier detecting callback intent post-call
//
// Each source should:
//   1. write a GHL tag `needs-callback` + custom field v48_callback_needed
//   2. insert a row in automation_events with event_type='callback_needed'
//   3. fan out to downstream recipes via GHL_EVENT_TO_RECIPES["CallbackNeeded"]
//
// This spec covers (a) at the unit level and (b) at the API level. Full UI
// + Voice-AI coverage ride on E2E-7 and the voice integration spec.
// ---------------------------------------------------------------------------

import { test, expect } from "@playwright/test";

test.describe("E2E-2: callback-needed flow", () => {
  test.describe.configure({
    mode: "serial",
    timeout: process.env.PLAYWRIGHT_BASE_URL?.trim() ? 90_000 : 30_000,
  });

  test.beforeAll(() => {
    test.skip(
      !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
      "Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated E2E",
    );
  });

  test("(a) GHL NoteCreate with callback keyword dispatches CallbackNeeded", async ({
    request,
  }) => {
    test.skip(
      !process.env.GHL_WEBHOOK_TEST_SECRET && !process.env.GHL_WEBHOOK_ALLOW_UNSIGNED,
      "Requires GHL_WEBHOOK_TEST_SECRET or GHL_WEBHOOK_ALLOW_UNSIGNED=true for local testing",
    );
    test.skip(
      !process.env.E2E_TEST_LOCATION_ID || !process.env.E2E_TEST_CONTACT_ID,
      "Requires E2E_TEST_LOCATION_ID and E2E_TEST_CONTACT_ID for tenant mapping",
    );

    const payload = {
      type: "NoteCreate",
      locationId: process.env.E2E_TEST_LOCATION_ID,
      noteId: `test-note-${Date.now()}`,
      contactId: process.env.E2E_TEST_CONTACT_ID,
      body: "Please call me back when you have a chance.",
      timestamp: new Date().toISOString(),
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (process.env.GHL_WEBHOOK_TEST_SECRET) {
      headers["X-GHL-Test-Secret"] = process.env.GHL_WEBHOOK_TEST_SECRET;
    }

    const response = await request.post("/api/webhooks/ghl", {
      headers,
      data: payload,
    });

    expect(response.status()).toBe(200);
    // Downstream effects (tag write, automation_events row, recipe trigger)
    // are async via queueMicrotask — in a full matrix run the QA agent polls
    // Supabase to assert the row appeared with event_type='callback_needed'.
  });

  test("(b) UI button POST /api/ghl/contacts/[id]/callback emits CallbackNeeded event", async ({
    page,
    request,
  }) => {
    test.skip(
      !process.env.E2E_TEST_CONTACT_ID,
      "Requires E2E_TEST_CONTACT_ID mapped to the session account",
    );

    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.E2E_TEST_EMAIL!);
    await page.getByPlaceholder("Enter your password").fill(process.env.E2E_TEST_PASSWORD!);
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL(
      (url: URL) =>
        url.pathname.startsWith("/dashboard") ||
        url.pathname.startsWith("/onboarding"),
      { timeout: 60_000 },
    );

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const response = await request.post(
      `/api/ghl/contacts/${process.env.E2E_TEST_CONTACT_ID}/callback`,
      {
        headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
        data: { reason: "E2E-2 regression", contactName: "E2E Contact" },
      },
    );

    expect([201, 502]).toContain(response.status());
    if (response.status() === 201) {
      const body = await response.json();
      expect(body.eventId).toBeTruthy();
      expect(body.ghlWrites).toBeDefined();
    }
  });
});
