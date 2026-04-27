import { afterEach, describe, expect, it, vi } from "vitest";

import { GhlMcpClient, McpError } from "./mcp";

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: { method: string; params?: unknown };
}

function fakeFetch(
  responder: (req: CapturedRequest) => Response | Promise<Response>,
): { calls: CapturedRequest[]; spy: ReturnType<typeof vi.spyOn> } {
  const calls: CapturedRequest[] = [];
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const captured: CapturedRequest = {
        url: typeof input === "string" ? input : input.toString(),
        method: init?.method ?? "GET",
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: init?.body ? JSON.parse(init.body as string) : { method: "" },
      };
      calls.push(captured);
      return responder(captured);
    });
  return { calls, spy };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

function sseResponse(body: unknown, status = 200): Response {
  const data = `event: message\ndata: ${JSON.stringify(body)}\n\n`;
  return new Response(data, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("GhlMcpClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends initialize once, then tools/list with PIT and locationId headers", async () => {
    let initCalled = 0;
    const { calls } = fakeFetch((req) => {
      const method = req.body.method;
      if (method === "initialize") {
        initCalled += 1;
        return jsonResponse({
          jsonrpc: "2.0",
          id: 1,
          result: { serverInfo: { name: "ghl", version: "1" } },
        });
      }
      if (method === "tools/list") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: 2,
          result: {
            tools: [
              {
                name: "contacts_get-contact",
                description: "Get a contact",
                inputSchema: { type: "object" },
              },
            ],
          },
        });
      }
      return jsonResponse({ error: { message: "unexpected" } });
    });

    const client = new GhlMcpClient({
      pit: "pit_secret_xyz",
      locationId: "loc_42",
      url: "https://example.test/mcp/",
    });

    const tools = await client.listTools();
    await client.listTools(); // second call must not re-initialize

    expect(initCalled).toBe(1);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("contacts_get-contact");

    const initCall = calls.find((c) => c.body.method === "initialize")!;
    expect(initCall.headers["authorization"]).toBe("Bearer pit_secret_xyz");
    expect(initCall.headers["locationid"]).toBe("loc_42");
    expect(initCall.url).toBe("https://example.test/mcp/");
  });

  it("parses Streamable HTTP SSE responses", async () => {
    fakeFetch((req) =>
      req.body.method === "initialize"
        ? sseResponse({ jsonrpc: "2.0", id: 1, result: {} })
        : sseResponse({ jsonrpc: "2.0", id: 2, result: { tools: [] } }),
    );

    const client = new GhlMcpClient({
      pit: "pit",
      locationId: "loc",
      url: "https://example.test/mcp/",
    });
    await expect(client.listTools()).resolves.toEqual([]);
  });

  it("throws McpError when the JSON-RPC envelope contains an error", async () => {
    fakeFetch(() =>
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32601, message: "method not found" },
      }),
    );

    const client = new GhlMcpClient({
      pit: "pit",
      locationId: "loc",
      url: "https://example.test/mcp/",
    });

    await expect(client.listTools()).rejects.toBeInstanceOf(McpError);
    await expect(client.listTools()).rejects.toThrow(/method not found/);
  });

  it("throws McpError on non-2xx HTTP", async () => {
    fakeFetch(
      () =>
        new Response("Forbidden — invalid PIT", {
          status: 403,
          headers: { "Content-Type": "text/plain" },
        }),
    );

    const client = new GhlMcpClient({
      pit: "pit",
      locationId: "loc",
      url: "https://example.test/mcp/",
    });

    await expect(client.listTools()).rejects.toMatchObject({
      name: "McpError",
      code: 403,
    });
  });

  it("forwards tool args under arguments key on tools/call", async () => {
    const { calls } = fakeFetch((req) => {
      if (req.body.method === "initialize") {
        return jsonResponse({ jsonrpc: "2.0", id: 1, result: {} });
      }
      return jsonResponse({
        jsonrpc: "2.0",
        id: 2,
        result: { content: [{ type: "text", text: "ok" }] },
      });
    });

    const client = new GhlMcpClient({
      pit: "pit",
      locationId: "loc",
      url: "https://example.test/mcp/",
    });
    const result = await client.callTool("contacts_get-contact", {
      contactId: "ghl-1",
    });

    expect(result.content[0]).toEqual({ type: "text", text: "ok" });
    const callBody = calls.find((c) => c.body.method === "tools/call")!.body as {
      params: { name: string; arguments: Record<string, unknown> };
    };
    expect(callBody.params.name).toBe("contacts_get-contact");
    expect(callBody.params.arguments).toEqual({ contactId: "ghl-1" });
  });
});
