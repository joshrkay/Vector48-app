import { test, expect } from "@playwright/test";

test.describe("public auth routes", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });

  test("signup page renders", async ({ page }) => {
    await page.goto("/signup");
    await expect(
      page.getByRole("heading", { name: "Create your account" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create Account" }),
    ).toBeVisible();
  });
});
