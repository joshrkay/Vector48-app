import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("posthog wrapper", () => {
  const originalApiKey = process.env.POSTHOG_API_KEY;
  const originalHost = process.env.POSTHOG_HOST;
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.POSTHOG_API_KEY;
    else process.env.POSTHOG_API_KEY = originalApiKey;
    if (originalHost === undefined) delete process.env.POSTHOG_HOST;
    else process.env.POSTHOG_HOST = originalHost;
    consoleErrorSpy.mockClear();
  });

  it("is a no-op when POSTHOG_API_KEY is unset (track does not throw)", async () => {
    delete process.env.POSTHOG_API_KEY;
    const { track, identify, flush } = await import("./posthog");
    expect(() => track("account_123", "user_signed_up", { source: "test" })).not.toThrow();
    expect(() => identify("account_123", { plan: "trial" })).not.toThrow();
    await expect(flush()).resolves.toBeUndefined();
  });

  it("is a no-op when POSTHOG_API_KEY is whitespace", async () => {
    process.env.POSTHOG_API_KEY = "   ";
    const { track } = await import("./posthog");
    expect(() => track("account_123", "recipe_activated", { slug: "test" })).not.toThrow();
  });
});
