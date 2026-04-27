import "server-only";

// ---------------------------------------------------------------------------
// GoHighLevel MCP Client
//
// Thin JSON-RPC client for the GHL MCP server at
// https://services.leadconnectorhq.com/mcp/. Uses Streamable HTTP transport
// (single POST with JSON or SSE response). Authenticates with the
// per-account Private Integration Token loaded via getAccountPit().
//
// We keep this transport-only — no SDK dependency. The MCP spec we target
// is the JSON-RPC 2.0 surface (initialize, tools/list, tools/call) which
// is stable across the GHL implementation. If GHL adds resources/prompts
// we'll add wrappers here, not in the recipe runner.
// ---------------------------------------------------------------------------

const DEFAULT_MCP_URL = "https://services.leadconnectorhq.com/mcp/";
const PROTOCOL_VERSION = "2025-06-18";
const REQUEST_TIMEOUT_MS = 30_000;

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

export interface McpToolCallResult {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
    | { type: "resource"; resource: { uri: string; text?: string; mimeType?: string } }
  >;
  isError?: boolean;
  structuredContent?: unknown;
}

export class McpError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "McpError";
  }
}

export interface GhlMcpClientConfig {
  pit: string;
  locationId: string;
  url?: string;
}

export class GhlMcpClient {
  private readonly url: string;
  private readonly pit: string;
  private readonly locationId: string;
  private requestId = 0;
  private initializePromise: Promise<void> | null = null;

  constructor(config: GhlMcpClientConfig) {
    this.url = config.url ?? process.env.GHL_MCP_URL ?? DEFAULT_MCP_URL;
    this.pit = config.pit;
    this.locationId = config.locationId;
  }

  private nextId(): number {
    this.requestId += 1;
    return this.requestId;
  }

  private async rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.pit}`,
          "Content-Type": "application/json",
          // Some MCP servers prefer SSE; we accept both and parse below.
          Accept: "application/json, text/event-stream",
          locationId: this.locationId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: this.nextId(),
          method,
          params,
        }),
        signal: controller.signal,
        cache: "no-store",
      });

      const text = await response.text();
      if (!response.ok) {
        throw new McpError(
          `GHL MCP HTTP ${response.status}: ${text.slice(0, 300)}`,
          response.status,
        );
      }

      const envelope = parseEnvelope(text, response.headers.get("content-type"));
      if (envelope.error) {
        throw new McpError(
          envelope.error.message ?? "MCP error",
          envelope.error.code,
          envelope.error.data,
        );
      }
      return envelope.result as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async initialize(): Promise<void> {
    // Memoize per-instance so repeat tool calls don't re-shake hands.
    if (this.initializePromise) return this.initializePromise;
    this.initializePromise = this.rpc<unknown>("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "vector48", version: "1" },
    }).then(() => undefined);
    return this.initializePromise;
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    await this.initialize();
    const result = await this.rpc<{ tools?: McpToolDescriptor[] }>(
      "tools/list",
      {},
    );
    return result.tools ?? [];
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpToolCallResult> {
    await this.initialize();
    return this.rpc<McpToolCallResult>("tools/call", {
      name,
      arguments: args,
    });
  }
}

function parseEnvelope(
  text: string,
  contentType: string | null,
): { result?: unknown; error?: { code?: number; message?: string; data?: unknown } } {
  if (contentType?.includes("text/event-stream")) {
    const dataLines = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    if (dataLines.length === 0) {
      throw new McpError("MCP SSE response had no data frames");
    }
    return JSON.parse(dataLines[dataLines.length - 1]);
  }
  if (!text.trim()) {
    throw new McpError("MCP returned an empty body");
  }
  return JSON.parse(text);
}

/**
 * Build a GhlMcpClient for the given account. Throws if the account has
 * no PIT installed — callers should handle that case explicitly (e.g. by
 * returning a `skipped_no_pit` outcome rather than crashing).
 */
export async function getMcpClientForAccount(accountId: string): Promise<GhlMcpClient> {
  const { getAccountPit } = await import("./token");
  const { pit, locationId } = await getAccountPit(accountId);
  return new GhlMcpClient({ pit, locationId });
}
