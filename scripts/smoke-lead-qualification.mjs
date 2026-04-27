// ---------------------------------------------------------------------------
// Lead-Qualification Smoke Harness
//
// Exercises the multi-turn lead-qualification handler end-to-end with all
// externals mocked (Supabase, GHL MCP, Anthropic). Proves the Phase 1
// wiring works: history pre-load via MCP get-messages → tool-use loop →
// MCP send/create-task calls → final outcome.
//
// Three scenarios mimicking a real qualification conversation:
//   1. Cold start (no history) → agent sends first qualification SMS
//   2. Mid-conversation (history loaded) → agent reads context, asks next
//   3. Completion (4 facts gathered) → agent creates task, marks lead qualified
//
// Writes a JSON trace artifact to qa/audits/lead-qualification-smoke.json
// and exits non-zero on any divergence from expected outcomes.
//
// No real network. The probe script (scripts/probe-ghl-mcp.mjs) covers
// real-MCP integration; this script covers the handler logic given any
// MCP-shaped tool inventory.
//
// Usage:
//   node --experimental-strip-types scripts/smoke-lead-qualification.mjs
// ---------------------------------------------------------------------------

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// The handler is the seam — same one the unit tests use. We import the
// factory and build a handler with our shims as deps.
const { createLeadQualificationHandler } = await import(
  "../lib/recipes/runner/recipes/leadQualification.ts"
);

// ── shims ──────────────────────────────────────────────────────────────────

const ACCOUNT_ID = "11111111-1111-1111-1111-111111111111";
const AGENT_ID = "22222222-2222-2222-2222-222222222222";
const CONTACT_ID = "ghl-contact-9";
const CONVERSATION_ID = "conv-1";

const TENANT_AGENT_ROW = {
  id: AGENT_ID,
  account_id: ACCOUNT_ID,
  recipe_slug: "lead-qualification",
  display_name: "Lead Qualifier",
  system_prompt:
    "You qualify leads for Smoke Test HVAC. Ask short, polite questions.",
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  temperature: 0.4,
  voice_id: null,
  tool_config: {
    enabledTools: [
      "sendSms",
      "lookupContact",
      "createTask",
      "checkCalendar",
    ],
  },
  monthly_spend_cap_micros: null,
  rate_limit_per_hour: null,
  status: "active",
};

const ACCOUNT_ROW = {
  id: ACCOUNT_ID,
  business_name: "Smoke Test HVAC",
  vertical: "hvac",
  plan_slug: "growth",
  greeting_name: null,
  notification_contact_phone: null,
};

const MCP_TOOL_INVENTORY = [
  {
    name: "contacts_get-contact",
    description: "Fetch a contact",
    inputSchema: {
      type: "object",
      properties: { contactId: { type: "string" } },
      required: ["contactId"],
    },
  },
  {
    name: "conversations_send-a-new-message",
    description: "Send a reply",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        message: { type: "string" },
      },
      required: ["contactId", "message"],
    },
  },
  {
    name: "contacts_create-task",
    description: "Create a task on a contact",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        title: { type: "string" },
        dueDate: { type: "string" },
      },
      required: ["contactId", "title", "dueDate"],
    },
  },
  {
    name: "calendars_get-calendar-events",
    description: "List events",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "conversations_get-messages",
    description: "Fetch conversation history",
    inputSchema: {
      type: "object",
      properties: {
        conversationId: { type: "string" },
        limit: { type: "number" },
      },
      required: ["conversationId"],
    },
  },
];

function makeFakeMcp(historyMessages, mcpCalls) {
  return {
    async listTools() {
      return MCP_TOOL_INVENTORY;
    },
    async callTool(name, args) {
      mcpCalls.push({ name, args });
      if (name === "conversations_get-messages") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ messages: historyMessages }),
            },
          ],
        };
      }
      return {
        content: [{ type: "text", text: `ok:${name}` }],
      };
    },
  };
}

function makeTrackedAi(scripted, aiCalls, llmUsageInserts) {
  let i = 0;
  return {
    messages: {
      create: async (params) => {
        aiCalls.push(JSON.parse(JSON.stringify(params)));
        const next = scripted[i];
        i += 1;
        if (!next) {
          throw new Error(
            `Scripted Anthropic responses exhausted at call ${i}`,
          );
        }
        // Mirror the tracked client's behavior: log a usage row.
        llmUsageInserts.push({
          account_id: ACCOUNT_ID,
          tenant_agent_id: AGENT_ID,
          recipe_slug: "lead-qualification",
          model: params.model,
          input_tokens: next.usage.input_tokens,
          output_tokens: next.usage.output_tokens,
        });
        return next;
      },
    },
  };
}

// ── scripted assistant turns ───────────────────────────────────────────────

function textResponse(text, tokensIn = 50, tokensOut = 30) {
  return {
    id: "msg_text",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    stop_reason: "end_turn",
    stop_sequence: null,
    content: [{ type: "text", text }],
    usage: {
      input_tokens: tokensIn,
      output_tokens: tokensOut,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  };
}

function toolUseResponse(toolName, input, toolUseId, tokensIn = 60, tokensOut = 25) {
  return {
    id: "msg_tool",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    stop_reason: "tool_use",
    stop_sequence: null,
    content: [{ type: "tool_use", id: toolUseId, name: toolName, input }],
    usage: {
      input_tokens: tokensIn,
      output_tokens: tokensOut,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  };
}

// ── scenarios ──────────────────────────────────────────────────────────────

const scenarios = [
  {
    name: "1. cold-start: no prior history → agent sends qualification SMS",
    inboundText: "Hi, my AC is broken and I need help today",
    history: [],
    scripted: [
      toolUseResponse(
        "conversations_send-a-new-message",
        {
          contactId: CONTACT_ID,
          message: "Got it. What's the address so we can dispatch a tech?",
        },
        "tu_send_1",
      ),
      textResponse("Sent the qualification SMS."),
    ],
    expectedOutcome: "qualification_message_sent",
    expectedToolCalls: ["conversations_send-a-new-message"],
    expectedHistoryFetched: true,
  },
  {
    name: "2. mid-conversation: history loaded, agent asks next question",
    inboundText: "Tomorrow morning works",
    history: [
      {
        body: "Hi, my AC is broken",
        direction: "inbound",
        dateAdded: "2026-04-26T10:00:00Z",
      },
      {
        body: "Sure — when's a good time?",
        direction: "outbound",
        dateAdded: "2026-04-26T10:01:00Z",
      },
    ],
    scripted: [
      toolUseResponse(
        "conversations_send-a-new-message",
        {
          contactId: CONTACT_ID,
          message: "Tomorrow morning works. What's the service address?",
        },
        "tu_send_2",
      ),
      textResponse("Asked for the address."),
    ],
    expectedOutcome: "qualification_message_sent",
    expectedToolCalls: ["conversations_send-a-new-message"],
    expectedHistoryFetched: true,
  },
  {
    name: "3. completion: agent has 4 facts → creates qualification task",
    inboundText: "We're at 123 Main St, Phoenix AZ 85001",
    history: [
      {
        body: "Hi, my AC is broken",
        direction: "inbound",
        dateAdded: "2026-04-26T10:00:00Z",
      },
      {
        body: "What's the address?",
        direction: "outbound",
        dateAdded: "2026-04-26T10:02:00Z",
      },
    ],
    scripted: [
      toolUseResponse(
        "contacts_create-task",
        {
          contactId: CONTACT_ID,
          title:
            "Qualified lead — AC repair, urgent, 123 Main St Phoenix AZ, ready to book",
          dueDate: "2026-04-28",
        },
        "tu_task",
      ),
      textResponse("Lead qualified and task created."),
    ],
    expectedOutcome: "qualification_completed",
    expectedToolCalls: ["contacts_create-task"],
    expectedHistoryFetched: true,
  },
];

// ── runner ─────────────────────────────────────────────────────────────────

const traces = [];

for (const scenario of scenarios) {
  console.log(`\n▶ ${scenario.name}`);

  const mcpCalls = [];
  const aiCalls = [];
  const llmUsageInserts = [];
  const fakeMcp = makeFakeMcp(scenario.history, mcpCalls);
  const fakeAi = makeTrackedAi(scenario.scripted, aiCalls, llmUsageInserts);

  const handler = createLeadQualificationHandler({
    deps: {
      getMcpClient: async () => fakeMcp,
    },
  });

  // Build the context the handler expects. Mirrors what the runner's
  // buildRecipeContext produces in production.
  const ctx = {
    accountId: ACCOUNT_ID,
    agent: TENANT_AGENT_ROW,
    account: ACCOUNT_ROW,
    ghl: {
      locationId: "loc-smoke",
      accessToken: "smoke-token",
    },
    ai: fakeAi,
    triggerId: null,
  };

  let result, error;
  try {
    result = await handler(ctx, {
      contactId: CONTACT_ID,
      conversationId: CONVERSATION_ID,
      inboundText: scenario.inboundText,
    });
  } catch (e) {
    error = e;
  }

  const status = error ? "error" : "ok";
  const historyCalled = mcpCalls.some(
    (c) => c.name === "conversations_get-messages",
  );
  const agentToolCalls = mcpCalls
    .filter((c) => c.name !== "conversations_get-messages")
    .map((c) => c.name);

  const expectedToolNamesMet =
    JSON.stringify(agentToolCalls.sort()) ===
    JSON.stringify([...scenario.expectedToolCalls].sort());

  const trace = {
    scenario: scenario.name,
    status,
    error: error ? String(error.message ?? error) : null,
    expected: {
      outcome: scenario.expectedOutcome,
      toolCalls: scenario.expectedToolCalls,
      historyFetched: scenario.expectedHistoryFetched,
    },
    actual: {
      outcome: result?.outcome ?? null,
      iterations: result?.iterations ?? null,
      toolCalls: result?.toolCalls ?? null,
      finalText: result?.finalText ?? null,
      historyFetched: historyCalled,
      mcpCallCount: mcpCalls.length,
      mcpCallNames: mcpCalls.map((c) => c.name),
      aiCallCount: aiCalls.length,
      aiToolsExposed: aiCalls[0]?.tools?.map((t) => t.name).sort() ?? [],
      aiFirstCallMessageCount: aiCalls[0]?.messages?.length ?? 0,
      llmUsageEventsRecorded: llmUsageInserts.length,
    },
    pass:
      status === "ok" &&
      result?.outcome === scenario.expectedOutcome &&
      historyCalled === scenario.expectedHistoryFetched &&
      expectedToolNamesMet,
  };

  console.log(
    `   outcome:  ${trace.actual.outcome ?? "—"}` +
      ` (expected ${trace.expected.outcome})  ${trace.pass ? "✓" : "✗"}`,
  );
  console.log(
    `   iter=${trace.actual.iterations}  ` +
      `mcp=${trace.actual.mcpCallCount}  ` +
      `ai=${trace.actual.aiCallCount}  ` +
      `usage=${trace.actual.llmUsageEventsRecorded}  ` +
      `historyFetched=${trace.actual.historyFetched}`,
  );
  if (trace.error) console.log(`   error: ${trace.error}`);

  traces.push(trace);
}

const outDir = path.resolve("qa/audits");
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "lead-qualification-smoke.json");
const allPass = traces.every((t) => t.pass);

writeFileSync(
  outPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      branch: "claude/evaluate-mcp-ghl-integration-g2GHu",
      summary: {
        scenariosRun: traces.length,
        scenariosPassed: traces.filter((t) => t.pass).length,
        allPass,
      },
      traces,
    },
    null,
    2,
  ),
);

console.log(`\nWrote artifact → ${outPath}`);
if (!allPass) {
  console.error("\n✗ One or more scenarios failed");
  process.exit(1);
}
console.log("\n✓ All scenarios passed");
