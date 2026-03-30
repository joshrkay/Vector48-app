import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { N8nClient, N8nClientError } from "@/lib/n8n/client";

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

  it("throws N8nClientError on 4xx with message from JSON body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const client = new N8nClient("https://example.app.n8n.cloud/api/v1", "k");
    await expect(client.getWorkflow("wf-1")).rejects.toMatchObject({
      name: "N8nClientError",
      status: 404,
      message: "Not found",
      path: "/workflows/wf-1",
    });
  });

  it("throws N8nClientError on 4xx with default message when body has no message", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "ERR" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const client = new N8nClient("https://example.app.n8n.cloud/api/v1", "k");
    await expect(client.deleteCredential("c1")).rejects.toMatchObject({
      name: "N8nClientError",
      status: 400,
      message: "N8N request failed (400)",
      path: "/credentials/c1",
    });
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

    const client = new N8nClient("https://example.app.n8n.cloud/api/v1", "k");
    const wf = { name: "t" };
    const result = await client.createWorkflow(wf);
    expect(result.id).toBe("w1");
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("throws N8nClientError after exhausting 503 retries", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(
        new Response("{}", {
          status: 503,
          statusText: "Service Unavailable",
        }),
      ),
    );

    const client = new N8nClient("https://example.app.n8n.cloud/api/v1", "k");
    const p = client.getWorkflow("wf-1");
    const assertion = expect(p).rejects.toMatchObject({
      name: "N8nClientError",
      status: 503,
      path: "/workflows/wf-1",
    });
    await vi.runAllTimersAsync();
    await assertion;
    expect(vi.mocked(fetch).mock.calls.length).toBe(4);
  });

  it("retries on network TypeError then throws on final failure", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const err = new TypeError("fetch failed");
    vi.mocked(fetch)
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(new TypeError("still down"));

    const client = new N8nClient("https://example.app.n8n.cloud/api/v1", "k");
    const p = client.activateWorkflow("wf-2");
    const assertion = expect(p).rejects.toThrow("still down");
    await vi.runAllTimersAsync();
    await assertion;
    expect(vi.mocked(fetch).mock.calls.length).toBe(4);
  });
});
