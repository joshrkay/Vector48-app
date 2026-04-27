#!/usr/bin/env node
// ---------------------------------------------------------------------------
// GHL MCP Probe
//
// Hits the GoHighLevel MCP server with a Private Integration Token and
// prints the tool inventory. Run once per location before relying on MCP
// in a recipe — confirms which tools the location's PIT actually exposes,
// since GHL is shipping new tools incrementally.
//
// Usage:
//   GHL_MCP_PIT=pit_xxx GHL_LOCATION_ID=loc_xxx \
//     node scripts/probe-ghl-mcp.mjs
//
// Optional:
//   GHL_MCP_URL=https://services.leadconnectorhq.com/mcp/   (default)
//   FILTER=contact          → only print tools whose name contains "contact"
// ---------------------------------------------------------------------------

const DEFAULT_URL = "https://services.leadconnectorhq.com/mcp/";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

async function mcpRequest(url, pit, locationId, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pit}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      locationId,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`MCP HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  // Streamable HTTP can return either JSON or SSE. We asked for JSON
  // first in Accept, so if the server respects it we get a single envelope.
  // Fall back to parsing SSE 'data:' lines if Content-Type says event-stream.
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const dataLines = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    if (dataLines.length === 0) {
      throw new Error("SSE response contained no data frames");
    }
    return JSON.parse(dataLines[dataLines.length - 1]);
  }

  return JSON.parse(text);
}

async function main() {
  const pit = requireEnv("GHL_MCP_PIT");
  const locationId = requireEnv("GHL_LOCATION_ID");
  const url = process.env.GHL_MCP_URL ?? DEFAULT_URL;
  const filter = process.env.FILTER?.toLowerCase() ?? null;

  console.log(`→ Initializing MCP session against ${url}`);

  const initResponse = await mcpRequest(url, pit, locationId, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: {
        name: "vector48-probe",
        version: "0.1.0",
      },
    },
  });

  if (initResponse.error) {
    console.error("MCP initialize failed:", initResponse.error);
    process.exit(2);
  }

  const serverInfo = initResponse.result?.serverInfo;
  console.log(
    `✓ Connected: ${serverInfo?.name ?? "unknown"} v${serverInfo?.version ?? "?"}`,
  );

  const listResponse = await mcpRequest(url, pit, locationId, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });

  if (listResponse.error) {
    console.error("MCP tools/list failed:", listResponse.error);
    process.exit(3);
  }

  const tools = listResponse.result?.tools ?? [];
  const filtered = filter
    ? tools.filter((t) => t.name.toLowerCase().includes(filter))
    : tools;

  console.log(`\n${filtered.length} of ${tools.length} tools:\n`);
  for (const tool of filtered) {
    const required = tool.inputSchema?.required ?? [];
    const props = Object.keys(tool.inputSchema?.properties ?? {});
    console.log(`• ${tool.name}`);
    if (tool.description) {
      console.log(`    ${tool.description.slice(0, 120)}`);
    }
    if (props.length) {
      const marked = props.map((p) => (required.includes(p) ? `${p}*` : p));
      console.log(`    args: ${marked.join(", ")}`);
    }
  }

  // What lead-qualification needs (per archetype tool_config).
  const NEEDED = [
    "contacts_get-contact",
    "contacts_search",
    "conversations_send-a-new-message",
    "calendars_get-calendar-events",
    "contacts_create-task",
  ];
  const present = new Set(tools.map((t) => t.name));
  const matches = NEEDED.map((wanted) => {
    const exact = present.has(wanted);
    const fuzzy = !exact
      ? tools.find((t) =>
          t.name
            .toLowerCase()
            .includes(wanted.split("_").pop().replace(/-/g, "")),
        )
      : null;
    return { wanted, exact, fuzzy: fuzzy?.name ?? null };
  });

  console.log("\nLead-qualification tool coverage check:");
  for (const m of matches) {
    if (m.exact) {
      console.log(`  ✓ ${m.wanted}`);
    } else if (m.fuzzy) {
      console.log(`  ~ ${m.wanted} (closest: ${m.fuzzy})`);
    } else {
      console.log(`  ✗ ${m.wanted} — NOT FOUND`);
    }
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
