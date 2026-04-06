import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * When set (e.g. https://app.example.com), tests run against that deployment and
 * no local dev server is started. Use staging or a preview URL when possible.
 */
const liveBase =
  process.env.PLAYWRIGHT_BASE_URL?.trim().replace(/\/$/, "") ?? "";
const useLive =
  liveBase.length > 0 && /^https?:\/\//i.test(liveBase);

/** Dedicated port so local E2E does not fight a normal dev server on 3000. */
const E2E_PORT = 3333;
const baseURL = useLive ? liveBase : `http://127.0.0.1:${E2E_PORT}`;

const desktopChrome = {
  viewport: { width: 1280, height: 720 } as const,
};

/** Next dev needs these for middleware; inherit shell/.env.local via process.env, else CI-safe placeholders. */
const webServerEnv = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL:
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://fake.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "fake-anon-key",
};

const localWebServer = {
  command: `npm run dev -- -p ${E2E_PORT} -H 127.0.0.1`,
  url: `http://127.0.0.1:${E2E_PORT}`,
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
  cwd: __dirname,
  env: webServerEnv,
  stdout: "pipe" as const,
  stderr: "pipe" as const,
};

export default defineConfig({
  // Absolute path so discovery works even if cwd is wrong when loading this file
  testDir: path.join(__dirname, "e2e"),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  expect: {
    timeout: useLive ? 30_000 : 15_000,
  },
  ...(!useLive ? { webServer: localWebServer } : {}),
  projects: [
    {
      name: "chromium",
      // Globs are more reliable across OS/Playwright versions than RegExp here
      testMatch: "**/*.spec.ts",
      use: desktopChrome,
    },
  ],
});
