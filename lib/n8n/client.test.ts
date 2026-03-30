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
  });

  it("throws N8nClientError on 4xx", async () => {
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
});
