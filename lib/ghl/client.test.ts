import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GHLClient } from "./client";
import { GHLRateLimitError, GHLValidationError } from "./errors";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("GHLClient foundation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T00:00:00.000Z"));
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("allows parallel requests under the per-location budget", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(jsonResponse({ contacts: [] })));
    const client = GHLClient.forLocation("loc-parallel", "token");

    const results = await Promise.all(
      Array.from({ length: 5 }, () => client.contacts.list({ limit: 1 })),
    );

    expect(results).toHaveLength(5);
    expect(fetchSpy).toHaveBeenCalledTimes(5);
  });

  it("throws before network call when the local per-location budget is exhausted", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(jsonResponse({ contacts: [] })));
    const client = GHLClient.forLocation("loc-exhausted", "token");

    await Promise.all(
      Array.from({ length: 120 }, () => client.contacts.list({ limit: 1 })),
    );

    await expect(client.contacts.list({ limit: 1 })).rejects.toBeInstanceOf(
      GHLRateLimitError,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(120);
  });

  it("resets the local budget after 60 seconds", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(jsonResponse({ contacts: [] })),
    );
    const client = GHLClient.forLocation("loc-reset", "token");

    await Promise.all(
      Array.from({ length: 120 }, () => client.contacts.list({ limit: 1 })),
    );
    await expect(client.contacts.list({ limit: 1 })).rejects.toBeInstanceOf(
      GHLRateLimitError,
    );

    await vi.advanceTimersByTimeAsync(60_000);

    await expect(client.contacts.list({ limit: 1 })).resolves.toMatchObject({
      data: [],
    });
  });

  it("does not share local buckets across locations", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(jsonResponse({ contacts: [] })),
    );
    const firstClient = GHLClient.forLocation("loc-a", "token");
    const secondClient = GHLClient.forLocation("loc-b", "token");

    await Promise.all(
      Array.from({ length: 120 }, () => firstClient.contacts.list({ limit: 1 })),
    );

    await expect(secondClient.contacts.list({ limit: 1 })).resolves.toMatchObject({
      data: [],
    });
  });

  it("retries transient 429 and 5xx responses with exponential backoff", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ message: "slow down" }, 429))
      .mockResolvedValueOnce(jsonResponse({ message: "server error" }, 500))
      .mockResolvedValueOnce(jsonResponse({ contacts: [] }, 200));
    const client = GHLClient.forLocation("loc-retry", "token");

    const promise = client.contacts.list({ limit: 1 });
    await vi.advanceTimersByTimeAsync(3_100);

    await expect(promise).resolves.toMatchObject({ data: [] });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("does not retry validation failures", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ message: "invalid", errors: { email: "bad" } }, 422));
    const client = GHLClient.forLocation("loc-validation", "token");

    await expect(client.contacts.list({ limit: 1 })).rejects.toBeInstanceOf(
      GHLValidationError,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
