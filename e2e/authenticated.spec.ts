import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";

const authDir = path.join(__dirname, ".auth");
const authFile = path.join(authDir, "user.json");

test.describe("authenticated (optional)", () => {
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

  test("signs in and saves session", async ({ page }) => {
    const email = process.env.E2E_TEST_EMAIL!;
    const password = process.env.E2E_TEST_PASSWORD!;

    await fs.mkdir(authDir, { recursive: true });

    await page.goto("/login");
    // Email: label is wired correctly. Password: use placeholder because older
    // deployments had FormControl wrapping a div (label did not target the input).
    await page.getByLabel("Email").fill(email);
    await page.getByPlaceholder("Enter your password").fill(password);
    await page.getByRole("button", { name: "Sign In" }).click();

    await page.waitForURL(
      (url: URL) =>
        url.pathname.startsWith("/dashboard") ||
        url.pathname.startsWith("/onboarding"),
      { timeout: 60_000 },
    );

    await page.context().storageState({ path: authFile });
  });

  test("dashboard shell loads with saved session", async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile });
    const page = await context.newPage();
    try {
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/(dashboard|onboarding|billing)/);
    } finally {
      await context.close();
    }
  });
});
