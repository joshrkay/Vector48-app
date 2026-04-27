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
    name: "unrelated_tool",
    description: "Should never be exposed to Claude",
    inputSchema: { type: "object" },
  },
];

interface FakeMcpOptions {
  toolResults?: Record<string, McpToolCallResult>;
  callsOut?: Array<{ name: string; args: Record<string, unknown> }>;
  throwOn?: string;
}

function fakeMcp(options: FakeMcpOptions = {}): McpToolHost {
  const calls = options.callsOut ?? [];
  return {
    async listTools() {
      return MCP_TOOLS;
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

    // MCP got the tool call.
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
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
