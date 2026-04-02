/**
 * E2E tests that verify form submissions actually persist to the Supabase
 * database.  Each test fills out a real browser form, submits it, then
 * queries Supabase directly (via the service-role key) to assert the
 * expected rows were written.
 *
 * Required env vars (tests are skipped when any are absent):
 *   E2E_TEST_EMAIL            — test account email
 *   E2E_TEST_PASSWORD         — test account password
 *   NEXT_PUBLIC_SUPABASE_URL  — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role key for admin DB reads
 */

import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";
import {
  hasDbCredentials,
  getAccountByEmail,
  resetOnboardingState,
  markOnboardingComplete,
} from "./helpers/db";

const authDir = path.join(__dirname, ".auth");
const authFile = path.join(authDir, "db-submission-user.json");

// ─── helpers ────────────────────────────────────────────────────────────────

const TIMEOUT = process.env.PLAYWRIGHT_BASE_URL?.trim() ? 90_000 : 45_000;

async function signIn(page: import("@playwright/test").Page) {
  const email = process.env.E2E_TEST_EMAIL!;
  const password = process.env.E2E_TEST_PASSWORD!;
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByPlaceholder("Enter your password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(
    (url) =>
      url.pathname.startsWith("/dashboard") ||
      url.pathname.startsWith("/onboarding") ||
      url.pathname.startsWith("/billing"),
    { timeout: 60_000 }
  );
  await page.context().storageState({ path: authFile });
}

function skipGuard() {
  const missingEnv = ["E2E_TEST_EMAIL", "E2E_TEST_PASSWORD"].filter(
    (k) => !process.env[k]
  );
  test.skip(
    missingEnv.length > 0 || !hasDbCredentials(),
    `Set E2E_TEST_EMAIL, E2E_TEST_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY to run database-submission E2E tests`
  );
}

// ─── Suite 1: Business Profile form ─────────────────────────────────────────

test.describe("Business Profile form saves to database", () => {
  test.describe.configure({ mode: "serial", timeout: TIMEOUT });

  test.beforeAll(async () => {
    skipGuard();
  });

  test("signs in", async ({ page }) => {
    await fs.mkdir(authDir, { recursive: true });
    await signIn(page);
  });

  test("profile form updates are persisted", async ({ browser }) => {
    const email = process.env.E2E_TEST_EMAIL!;
    const uniqueName = `E2E Biz ${Date.now()}`;

    const context = await browser.newContext({ storageState: authFile });
    const page = await context.newPage();

    try {
      await page.goto("/settings");

      // Wait for the form to be ready
      await page.getByLabel("Business name").waitFor({ state: "visible" });

      // Fill every profile field with fresh test values
      await page.getByLabel("Business name").fill(uniqueName);
      await page.getByLabel("Phone").fill("(512) 555-0199");
      await page.getByLabel("Email").fill("e2e-profile@example.com");
      await page.getByLabel("City").fill("Austin");
      await page.getByLabel("State").fill("TX");
      await page.getByLabel("ZIP").fill("78701");

      // Submit and wait for success toast
      await page.getByRole("button", { name: "Save profile" }).click();
      await expect(page.getByText("Profile saved")).toBeVisible({
        timeout: 15_000,
      });

      // ── Database assertion ──────────────────────────────────────────
      const account = await getAccountByEmail(email);

      expect(account.business_name).toBe(uniqueName);
      expect(account.phone).toBe("(512) 555-0199");
      expect(account.email).toBe("e2e-profile@example.com");
      expect(account.address_city).toBe("Austin");
      expect(account.address_state).toBe("TX");
      expect(account.address_zip).toBe("78701");
    } finally {
      await context.close();
    }
  });
});

// ─── Suite 2: Onboarding wizard saves to database ────────────────────────────

test.describe("Onboarding wizard saves each step to database", () => {
  test.describe.configure({ mode: "serial", timeout: TIMEOUT });

  test.beforeAll(async () => {
    skipGuard();
    const email = process.env.E2E_TEST_EMAIL!;
    // Clear onboarding so the page doesn't redirect to /dashboard.
    // Also removes recipe_activations rows to prevent constraint failures on retries.
    await resetOnboardingState(email);
  });

  test.afterAll(async () => {
    const email = process.env.E2E_TEST_EMAIL;
    if (email) {
      // Restore to completed state so manual use and other tests aren't broken
      await markOnboardingComplete(email).catch(() => {
        // Non-fatal: best-effort cleanup
      });
    }
  });

  test("signs in after onboarding reset", async ({ page }) => {
    await fs.mkdir(authDir, { recursive: true });
    await signIn(page);
    // After reset the app should land on /onboarding
    await page.waitForURL((url) => url.pathname.startsWith("/onboarding"), {
      timeout: 10_000,
    });
  });

  test("step 1 – business name is saved", async ({ browser }) => {
    const email = process.env.E2E_TEST_EMAIL!;
    const context = await browser.newContext({ storageState: authFile });
    const page = await context.newPage();

    try {
      await page.goto("/onboarding");
      await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });

      // Step 0 – Welcome: just click Continue
      await page
        .getByRole("button", { name: "Continue" })
        .click();

      // Step 1 – Business name
      await page
        .getByPlaceholder("e.g. Smith HVAC Services")
        .waitFor({ state: "visible" });
      await page
        .getByPlaceholder("e.g. Smith HVAC Services")
        .fill("E2E HVAC Co");
      await page.getByRole("button", { name: "Continue" }).click();

      // Wait for step 2 to appear (phone placeholder)
      await page
        .getByPlaceholder("(555) 123-4567")
        .first()
        .waitFor({ state: "visible" });

      // ── Database assertion ──────────────────────────────────────────
      const account = await getAccountByEmail(email);
      expect(account.business_name).toBe("E2E HVAC Co");
      expect(account.onboarding_step).toBe(2);
    } finally {
      await context.close();
    }
  });

  test("step 2 – phone is saved", async ({ browser }) => {
    const email = process.env.E2E_TEST_EMAIL!;
    const context = await browser.newContext({ storageState: authFile });
    const page = await context.newPage();

    try {
      await page.goto("/onboarding");
      await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });

      // The store is hydrated from DB, so we should land on the current step.
      // Step 2 should already be active (onboarding_step=2).
      await page
        .getByPlaceholder("(555) 123-4567")
        .first()
        .waitFor({ state: "visible" });
      await page.getByPlaceholder("(555) 123-4567").first().fill("(512) 555-0100");
      await page.getByRole("button", { name: "Continue" }).click();

      // Step 3 has vertical selection buttons; wait for "HVAC"
      await page
        .getByRole("button", { name: "HVAC" })
        .waitFor({ state: "visible" });

      // ── Database assertion ──────────────────────────────────────────
      const account = await getAccountByEmail(email);
      expect(account.phone).toBe("(512) 555-0100");
      expect(account.onboarding_step).toBe(3);
    } finally {
      await context.close();
    }
  });

  test("step 3 – vertical is saved", async ({ browser }) => {
    const email = process.env.E2E_TEST_EMAIL!;
    const context = await browser.newContext({ storageState: authFile });
    const page = await context.newPage();

    try {
      await page.goto("/onboarding");
      await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });

      // Should be on step 3 (vertical selection)
      await page
        .getByRole("button", { name: "HVAC" })
        .waitFor({ state: "visible" });
      await page.getByRole("button", { name: "HVAC" }).click();
      await page.getByRole("button", { name: "Continue" }).click();

      // Step 4 has business hours preset buttons
      await page
        .getByRole("button", { name: /Mon.+Fri.+8am/ })
        .waitFor({ state: "visible" });

      // ── Database assertion ──────────────────────────────────────────
      const account = await getAccountByEmail(email);
      expect(account.vertical).toBe("hvac");
      expect(account.onboarding_step).toBe(4);
    } finally {
      await context.close();
    }
  });

  test("step 4 – business hours preset is saved", async ({ browser }) => {
    const email = process.env.E2E_TEST_EMAIL!;
    const context = await browser.newContext({ storageState: authFile });
    const page = await context.newPage();

    try {
      await page.goto("/onboarding");
      await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });

      // Should be on step 4 (business hours)
      await page
        .getByRole("button", { name: /Mon.+Fri.+8am/ })
        .waitFor({ state: "visible" });
      // "Mon–Fri, 8am–5pm" is selected by default; explicitly click it
      await page.getByRole("button", { name: /Mon.+Fri.+8am/ }).click();
      await page.getByRole("button", { name: "Continue" }).click();

      // Step 5 has a voice greeting textarea
      await page
        .getByPlaceholder("Enter your greeting message...")
        .waitFor({ state: "visible" });

      // ── Database assertion ──────────────────────────────────────────
      const account = await getAccountByEmail(email);
      const hours = account.business_hours as Record<string, unknown> | null;
      expect(hours?.preset).toBe("weekday_8_5");
      expect(account.onboarding_step).toBe(5);
    } finally {
      await context.close();
    }
  });

  test("steps 5-7 complete onboarding and set onboarding_done_at", async ({
    browser,
  }) => {
    const email = process.env.E2E_TEST_EMAIL!;
    const context = await browser.newContext({ storageState: authFile });
    const page = await context.newPage();

    try {
      await page.goto("/onboarding");
      await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });

      // ── Step 5: Voice AI ─────────────────────────────────────────────
      const greetingTextarea = page.getByPlaceholder(
        "Enter your greeting message..."
      );
      await greetingTextarea.waitFor({ state: "visible" });
      // Leave greeting as pre-filled default; just continue
      await page.getByRole("button", { name: "Continue" }).click();

      // ── Step 6: Notifications ────────────────────────────────────────
      const notifInput = page.getByTestId("notification-contact");
      await notifInput.waitFor({ state: "visible" });
      await notifInput.fill("(512) 555-0200");
      await page.getByRole("button", { name: "Continue" }).click();

      // ── Step 7: Activate recipe (default = active) ───────────────────
      await page
        .getByRole("button", { name: "Finish Setup" })
        .waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Finish Setup" }).click();

      // Should redirect to /dashboard after completion
      await page.waitForURL(
        (url) =>
          url.pathname.startsWith("/dashboard") ||
          url.pathname.startsWith("/onboarding"),
        { timeout: 30_000 }
      );

      // ── Database assertion ──────────────────────────────────────────
      const account = await getAccountByEmail(email);
      expect(account.onboarding_done_at).not.toBeNull();
      expect(account.onboarding_step).toBe(8);
      expect(account.notification_contact).toBe("(512) 555-0200");
    } finally {
      await context.close();
    }
  });
});
