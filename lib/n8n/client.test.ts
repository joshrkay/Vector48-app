import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { N8nClient } from "@/lib/n8n/client";
import {
  N8nNotFoundError,
  N8nServerError,
  N8nValidationError,
} from "@/lib/n8n/errors";

describe("N8nClient", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("throws N8nNotFoundError on 404", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const client = new N8nClient("https://example.app.n8n.cloud", "k");
    await expect(client.getWorkflow("wf-1")).rejects.toBeInstanceOf(
      N8nNotFoundError,
    );
  });

  it("throws N8nValidationError on 4xx", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "ERR" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const client = new N8nClient("https://example.app.n8n.cloud", "k");
    await expect(client.deleteCredential("c1")).rejects.toBeInstanceOf(
      N8nValidationError,
    );
  });

  it("retries on 503 then succeeds", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response("{}", { status: 503, statusText: "Service Unavailable" }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "w1", active: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const client = new N8nClient("https://example.app.n8n.cloud", "k");
    const wf = { name: "t" };
    const result = await client.createWorkflow(wf);
    expect(result.id).toBe("w1");
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("throws N8nServerError after exhausting 503 retries", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(
        new Response("{}", {
          status: 503,
          statusText: "Service Unavailable",
        }),
      ),
    );

    const client = new N8nClient("https://example.app.n8n.cloud", "k");
    const p = client.getWorkflow("wf-1");
    const assertion = expect(p).rejects.toBeInstanceOf(N8nServerError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(vi.mocked(fetch).mock.calls.length).toBe(4);
  });
});
