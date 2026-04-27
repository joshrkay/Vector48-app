import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  Message,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages";

import type { RecipeContext } from "../context.ts";
import type {
  McpToolDescriptor,
  McpToolCallResult,
} from "@/lib/ghl/mcp";
import {
  createLeadQualificationHandler,
  findMcpTool,
  selectExposedTools,
  type LeadQualificationTrigger,
  type McpToolHost,
} from "./leadQualification.ts";

// Mirror @/lib/ghl/token's GhlPitNotConfiguredError without taking a
// runtime import on it (token.ts is server-only and node:test can't load
// it). The handler matches by error.name so the structural duplicate is
// equivalent to the real thing.
class FakePitNotConfiguredError extends Error {
  constructor(accountId: string) {
    super(`Account ${accountId} has no GHL Private Integration Token installed`);
    this.name = "GhlPitNotConfiguredError";
  }
}

// ── tool fixtures ──────────────────────────────────────────────────────────

const MCP_TOOLS: McpToolDescriptor[] = [
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
        body: { type: "string" },
        dueDate: { type: "string" },
      },
      required: ["contactId", "title", "dueDate"],
    },
  },
  {
    name: "calendars_get-calendar-events",
    description: "List events",
    inputSchema: {
      type: "object",
      properties: { calendarId: { type: "string" } },
    },
  },
  {
    name: "conversations_get-messages",
    description: "Fetch messages on a conversation",
    inputSchema: {
      type: "object",
      properties: {
        conversationId: { type: "string" },
        limit: { type: "number" },
      },
      required: ["conversationId"],
    },
  },
  {
    name: "unrelated_tool",
    description: "Should never be exposed to Claude",
    inputSchema: { type: "object" },
  },
];

// Variant without the history tool — used to test graceful degradation when
// GHL hasn't shipped or hasn't authorized that tool for the location.
const MCP_TOOLS_NO_HISTORY: McpToolDescriptor[] = MCP_TOOLS.filter(
  (t) => !t.name.includes("get-messages"),
);

interface FakeMcpOptions {
  toolResults?: Record<string, McpToolCallResult>;
  callsOut?: Array<{ name: string; args: Record<string, unknown> }>;
  throwOn?: string;
  tools?: McpToolDescriptor[];
}

function fakeMcp(options: FakeMcpOptions = {}): McpToolHost {
  const calls = options.callsOut ?? [];
  return {
    async listTools() {
      return options.tools ?? MCP_TOOLS;
    },
    async callTool(name, args) {
      calls.push({ name, args });
      if (options.throwOn === name) {
        throw new Error(`mcp ${name} blew up`);
      }
      return (
        options.toolResults?.[name] ?? {
          content: [{ type: "text", text: `ok:${name}` }],
        }
      );
    },
  };
}

// ── ctx fixture ────────────────────────────────────────────────────────────

interface FakeAiOptions {
  // A scripted sequence of responses the fake AI will return on each call.
  scripted: Message[];
}

interface FakeCtxOptions {
  enabledTools?: string[];
  ai: FakeAiOptions;
}

function fakeCtx(options: FakeCtxOptions) {
  let aiCallIndex = 0;
  const aiCalls: MessageCreateParamsNonStreaming[] = [];

  const ctx = {
    accountId: "acct-1",
    agent: {
      id: "agent-1",
      account_id: "acct-1",
      recipe_slug: "lead-qualification",
      display_name: "Test Lead Qualifier",
      system_prompt: "You qualify leads for Test HVAC.",
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      temperature: 0.4,
      voice_id: null,
      tool_config: {
        enabledTools: options.enabledTools ?? [
          "sendSms",
          "lookupContact",
          "createTask",
          "checkCalendar",
        ],
      },
      monthly_spend_cap_micros: 25_000_000,
      rate_limit_per_hour: 30,
      status: "active" as const,
    },
    account: {
      id: "acct-1",
      business_name: "Test HVAC",
      vertical: "hvac",
      plan_slug: "growth",
      greeting_name: null,
      notification_contact_phone: null,
    },
    ghl: {
      locationId: "loc-1",
      accessToken: "ghl-token-abc",
    },
    ai: {
      messages: {
        create: async (params: MessageCreateParamsNonStreaming): Promise<Message> => {
          // Snapshot the params (including messages) at call time. The
          // handler keeps mutating the same messages array across iterations,
          // so a live reference would show the post-run state instead of
          // what was sent on this turn.
          aiCalls.push(JSON.parse(JSON.stringify(params)));
          const next = options.ai.scripted[aiCallIndex];
          aiCallIndex += 1;
          if (!next) {
            throw new Error(
              `fakeCtx: scripted AI response exhausted at call ${aiCallIndex}`,
            );
          }
          return next;
        },
      },
    },
    triggerId: null,
  };

  return { ctx, aiCalls };
}

function assistantTextMessage(text: string): Message {
  return {
    id: "msg_text",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    stop_reason: "end_turn",
    stop_sequence: null,
    content: [{ type: "text", text, citations: null }],
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      server_tool_use: null,
      service_tier: null,
    },
  };
}

function assistantToolUseMessage(
  toolName: string,
  input: Record<string, unknown>,
  toolUseId = "tu_1",
): Message {
  return {
    id: "msg_tool",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    stop_reason: "tool_use",
    stop_sequence: null,
    content: [
      {
        type: "tool_use",
        id: toolUseId,
        name: toolName,
        input,
      },
    ],
    usage: {
      input_tokens: 20,
      output_tokens: 10,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      server_tool_use: null,
      service_tier: null,
    },
  };
}

const trigger: LeadQualificationTrigger = {
  contactId: "ghl-contact-9",
  conversationId: "conv-1",
  inboundText: "Hi, my AC is broken and I need help today",
};

// ── tests ──────────────────────────────────────────────────────────────────

describe("selectExposedTools", () => {
  it("maps logical names to MCP tool names via substring match", () => {
    const exposed = selectExposedTools(MCP_TOOLS, [
      "sendSms",
      "lookupContact",
    ]);
    const names = exposed.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "contacts_get-contact",
      "conversations_send-a-new-message",
    ]);
  });

  it("ignores unknown logical names without crashing", () => {
    const exposed = selectExposedTools(MCP_TOOLS, ["nonsense"]);
    assert.equal(exposed.length, 0);
  });
});

describe("leadQualification handler", () => {
  it("skips with skipped_no_pit when account has no PIT", async () => {
    const handler = createLeadQualificationHandler({
      deps: {
        getMcpClient: async () => {
          throw new FakePitNotConfiguredError("acct-1");
        },
      },
    });
    const { ctx } = fakeCtx({
      ai: { scripted: [assistantTextMessage("never used")] },
    });

    const result = await handler(ctx as unknown as RecipeContext, trigger);

    assert.equal(result.outcome, "skipped_no_pit");
    assert.equal(result.iterations, 0);
    assert.match(result.reason ?? "", /no GHL Private Integration Token/);
  });

  it("skips when inbound text is empty", async () => {
    const handler = createLeadQualificationHandler({
      deps: { getMcpClient: async () => fakeMcp() },
    });
    const { ctx } = fakeCtx({
      ai: { scripted: [assistantTextMessage("never used")] },
    });

    const result = await handler(ctx as unknown as RecipeContext, {
      ...trigger,
      inboundText: "   ",
    });

    assert.equal(result.outcome, "skipped_no_inbound_text");
  });

  it("skips when archetype enables zero tools", async () => {
    const handler = createLeadQualificationHandler({
      deps: { getMcpClient: async () => fakeMcp() },
    });
    const { ctx } = fakeCtx({
      enabledTools: [],
      ai: { scripted: [assistantTextMessage("never used")] },
    });

    const result = await handler(ctx as unknown as RecipeContext, trigger);

    assert.equal(result.outcome, "skipped_no_enabled_tools");
  });

  it("runs one tool then a final reply (qualification_message_sent)", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const handler = createLeadQualificationHandler({
      deps: {
        getMcpClient: async () => fakeMcp({ callsOut: calls }),
      },
    });

    const { ctx, aiCalls } = fakeCtx({
      ai: {
        scripted: [
          assistantToolUseMessage(
            "conversations_send-a-new-message",
            { contactId: "ghl-contact-9", message: "What's the address?" },
            "tu_send",
          ),
          assistantTextMessage("Sent the qualification reply."),
        ],
      },
    });

    const result = await handler(ctx as unknown as RecipeContext, trigger);

    assert.equal(result.outcome, "qualification_message_sent");
    assert.equal(result.iterations, 2);
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0].name, "conversations_send-a-new-message");
    assert.equal(result.toolCalls[0].ok, true);

    // MCP got the tool call. Filter out the history pre-load call —
    // tested separately below; existing assertions cover the agent loop.
    const agentCalls = calls.filter((c) => !c.name.includes("get-messages"));
    assert.equal(agentCalls.length, 1);
    assert.deepEqual(agentCalls[0], {
      name: "conversations_send-a-new-message",
      args: { contactId: "ghl-contact-9", message: "What's the address?" },
    });

    // Claude's first call should include the four mapped tools.
    const firstCall = aiCalls[0];
    assert.ok(firstCall.tools, "tools should be passed");
    const toolNames = (firstCall.tools ?? []).map((t) => t.name).sort();
    assert.deepEqual(toolNames, [
      "calendars_get-calendar-events",
      "contacts_create-task",
      "contacts_get-contact",
      "conversations_send-a-new-message",
    ]);
    // 'unrelated_tool' must never be exposed.
    assert.ok(!toolNames.includes("unrelated_tool"));

    // Second AI call should include the assistant tool_use message and a
    // user message containing the tool_result.
    const secondCall = aiCalls[1];
    const lastMessage = secondCall.messages[secondCall.messages.length - 1];
    assert.equal(lastMessage.role, "user");
    const lastContent = lastMessage.content;
    assert.ok(Array.isArray(lastContent));
    const toolResult = lastContent[0] as {
      type: string;
      tool_use_id: string;
      is_error: boolean;
    };
    assert.equal(toolResult.type, "tool_result");
    assert.equal(toolResult.tool_use_id, "tu_send");
    assert.equal(toolResult.is_error, false);
  });

  it("classifies as qualification_completed when create-task is called", async () => {
    const handler = createLeadQualificationHandler({
      deps: { getMcpClient: async () => fakeMcp() },
    });

    const { ctx } = fakeCtx({
      ai: {
        scripted: [
          assistantToolUseMessage(
            "contacts_create-task",
            {
              contactId: "ghl-contact-9",
              title: "Qualified lead — AC repair, urgent, Phoenix AZ",
              dueDate: "2026-04-28",
            },
            "tu_task",
          ),
          assistantTextMessage("Task created. Lead qualified."),
        ],
      },
    });

    const result = await handler(ctx as unknown as RecipeContext, trigger);
    assert.equal(result.outcome, "qualification_completed");
    assert.equal(result.iterations, 2);
  });

  it("surfaces tool errors as is_error=true tool_result and continues", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const handler = createLeadQualificationHandler({
      deps: {
        getMcpClient: async () =>
          fakeMcp({
            callsOut: calls,
            throwOn: "contacts_get-contact",
          }),
      },
    });

    const { ctx, aiCalls } = fakeCtx({
      ai: {
        scripted: [
          assistantToolUseMessage(
            "contacts_get-contact",
            { contactId: "ghl-contact-9" },
            "tu_get",
          ),
          assistantTextMessage("Falling back without contact."),
        ],
      },
    });

    const result = await handler(ctx as unknown as RecipeContext, trigger);
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0].ok, false);
    // The tool_result block sent back to Claude must mark is_error=true.
    const secondCall = aiCalls[1];
    const lastMessage = secondCall.messages[secondCall.messages.length - 1];
    const toolResult = (lastMessage.content as Array<{
      type: string;
      is_error: boolean;
    }>)[0];
    assert.equal(toolResult.is_error, true);
  });

  it("halts at MAX_AGENT_ITERATIONS if the model never stops calling tools", async () => {
    const handler = createLeadQualificationHandler({
      deps: { getMcpClient: async () => fakeMcp() },
    });

    // 6 tool_use responses — more than MAX_AGENT_ITERATIONS (5).
    const scripted: Message[] = Array.from({ length: 6 }, (_, i) =>
      assistantToolUseMessage(
        "conversations_send-a-new-message",
        { contactId: "ghl-contact-9", message: `loop ${i}` },
        `tu_${i}`,
      ),
    );

    const { ctx } = fakeCtx({ ai: { scripted } });

    const result = await handler(ctx as unknown as RecipeContext, trigger);
    assert.equal(result.outcome, "halted_max_iterations");
    assert.equal(result.iterations, 5);
    assert.equal(result.toolCalls.length, 5);
  });
});

// ── conversation history pre-load ─────────────────────────────────────────

function historyToolResult(messages: unknown[]): McpToolCallResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ messages }) }],
  };
}

describe("findMcpTool", () => {
  it("matches the first tool whose name contains a known pattern", () => {
    const found = findMcpTool(MCP_TOOLS, "conversationHistory");
    assert.equal(found?.name, "conversations_get-messages");
  });

  it("returns null when no MCP tool matches the logical name", () => {
    const found = findMcpTool(MCP_TOOLS_NO_HISTORY, "conversationHistory");
    assert.equal(found, null);
  });

  it("returns null for unknown logical names", () => {
    const found = findMcpTool(MCP_TOOLS, "totally-unknown-tool");
    assert.equal(found, null);
  });
});

describe("leadQualification handler — history pre-load", () => {
  it("seeds messages with prior conversation turns when GHL returns history", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const handler = createLeadQualificationHandler({
      deps: {
        getMcpClient: async () =>
          fakeMcp({
            callsOut: calls,
            toolResults: {
              "conversations_get-messages": historyToolResult([
                {
                  body: "Hi, I need AC service",
                  direction: "inbound",
                  dateAdded: "2026-04-26T10:00:00Z",
                },
                {
                  body: "Sure — when's a good time?",
                  direction: "outbound",
                  dateAdded: "2026-04-26T10:01:00Z",
                },
                {
                  body: "Tomorrow morning?",
                  direction: "inbound",
                  dateAdded: "2026-04-26T10:02:00Z",
                },
              ]),
            },
          }),
      },
    });

    const { ctx, aiCalls } = fakeCtx({
      ai: {
        scripted: [assistantTextMessage("Got it — what's the address?")],
      },
    });

    const result = await handler(ctx as unknown as RecipeContext, trigger);
    assert.equal(result.iterations, 1);
    assert.equal(result.outcome, "qualification_message_sent");

    // Pre-load fired with the conversationId.
    const historyCall = calls.find((c) => c.name === "conversations_get-messages");
    assert.ok(historyCall, "history pre-load should fire");
    assert.equal(historyCall!.args.conversationId, "conv-1");

    // First AI call must include the three history turns BEFORE the
    // current-turn user message.
    const firstCall = aiCalls[0];
    assert.equal(firstCall.messages.length, 4); // 3 history + 1 framing user
    assert.equal(firstCall.messages[0].role, "user");
    assert.equal(firstCall.messages[0].content, "Hi, I need AC service");
    assert.equal(firstCall.messages[1].role, "assistant");
    assert.equal(firstCall.messages[1].content, "Sure — when's a good time?");
    assert.equal(firstCall.messages[2].role, "user");
    assert.equal(firstCall.messages[2].content, "Tomorrow morning?");
    assert.equal(firstCall.messages[3].role, "user");
    // Framing message references "Prior conversation messages are above"
    assert.match(
      firstCall.messages[3].content as string,
      /Prior conversation messages are above/,
    );
  });

  it("strips the trailing history entry when it duplicates the inbound text", async () => {
    const handler = createLeadQualificationHandler({
      deps: {
        getMcpClient: async () =>
          fakeMcp({
            toolResults: {
              "conversations_get-messages": historyToolResult([
                {
                  body: "Hi, I need help",
                  direction: "inbound",
                  dateAdded: "2026-04-26T09:00:00Z",
                },
                // GHL has already persisted the latest inbound by the time
                // the webhook fires, so it'd appear here too.
                {
                  body: trigger.inboundText,
                  direction: "inbound",
                  dateAdded: "2026-04-26T10:00:00Z",
                },
              ]),
            },
          }),
      },
    });

    const { ctx, aiCalls } = fakeCtx({
      ai: { scripted: [assistantTextMessage("Reply")] },
    });

    await handler(ctx as unknown as RecipeContext, trigger);

    const firstCall = aiCalls[0];
    // Only 1 history turn survives; the duplicate is stripped. Plus the
    // framing user message → length 2.
    assert.equal(firstCall.messages.length, 2);
    assert.equal(firstCall.messages[0].content, "Hi, I need help");
  });

  it("proceeds without history when GHL hasn't shipped the messages tool", async () => {
    const handler = createLeadQualificationHandler({
      deps: {
        getMcpClient: async () => fakeMcp({ tools: MCP_TOOLS_NO_HISTORY }),
      },
    });

    const { ctx, aiCalls } = fakeCtx({
      ai: { scripted: [assistantTextMessage("Reply")] },
    });

    const result = await handler(ctx as unknown as RecipeContext, trigger);
    assert.equal(result.outcome, "qualification_message_sent");
    // Single user message — no history, just the framing message.
    assert.equal(aiCalls[0].messages.length, 1);
    assert.match(
      aiCalls[0].messages[0].content as string,
      /Lead just said: Hi, my AC is broken/,
    );
    // Framing must NOT claim prior history exists when none was loaded.
    assert.doesNotMatch(
      aiCalls[0].messages[0].content as string,
      /Prior conversation messages are above/,
    );
  });

  it("proceeds without history when the pre-load tool call throws", async () => {
    const handler = createLeadQualificationHandler({
      deps: {
        getMcpClient: async () =>
          fakeMcp({ throwOn: "conversations_get-messages" }),
      },
    });

    const { ctx, aiCalls } = fakeCtx({
      ai: { scripted: [assistantTextMessage("Reply")] },
    });

    const result = await handler(ctx as unknown as RecipeContext, trigger);
    assert.equal(result.outcome, "qualification_message_sent");
    assert.equal(aiCalls[0].messages.length, 1);
  });

  it("proceeds without history when the trigger has no conversationId", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const handler = createLeadQualificationHandler({
      deps: { getMcpClient: async () => fakeMcp({ callsOut: calls }) },
    });

    const { ctx, aiCalls } = fakeCtx({
      ai: { scripted: [assistantTextMessage("Reply")] },
    });

    await handler(ctx as unknown as RecipeContext, {
      ...trigger,
      conversationId: null,
    });

    // No history call at all — we don't have a conversation to look up.
    const historyCall = calls.find(
      (c) => c.name === "conversations_get-messages",
    );
    assert.equal(historyCall, undefined);
    assert.equal(aiCalls[0].messages.length, 1);
  });

  it("ignores non-JSON history responses and proceeds with no history", async () => {
    const handler = createLeadQualificationHandler({
      deps: {
        getMcpClient: async () =>
          fakeMcp({
            toolResults: {
              "conversations_get-messages": {
                content: [
                  { type: "text", text: "Not parseable as JSON, sorry" },
                ],
              },
            },
          }),
      },
    });

    const { ctx, aiCalls } = fakeCtx({
      ai: { scripted: [assistantTextMessage("Reply")] },
    });

    const result = await handler(ctx as unknown as RecipeContext, trigger);
    assert.equal(result.outcome, "qualification_message_sent");
    assert.equal(aiCalls[0].messages.length, 1);
  });
});
