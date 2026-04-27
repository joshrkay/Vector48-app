// ---------------------------------------------------------------------------
// Recipe Handler: Lead Qualification (multi-turn, MCP-backed)
//
// Replaces the previous single-shot SMS stub. Each inbound SMS from a new
// lead fires this handler; the agent reads recent conversation history,
// decides what to ask next, and may call GHL tools (lookup contact, send
// reply, create a task with a qualification summary, check calendar) via
// the GoHighLevel MCP server. The "multi-turn" nature is across webhook
// deliveries — one trigger = one agent turn = ≤ N MCP tool calls before a
// final reply is sent.
//
// Tool surface is operator-fixed (archetype `enabledTools`). Tenants edit
// the system prompt; they cannot enable additional tools.
//
// If the account has no PIT installed yet, returns `skipped_no_pit` so the
// runner can record a clear reason in automation_events instead of crashing.
// ---------------------------------------------------------------------------

import type {
  Message,
  MessageParam,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";

import type { RecipeContext } from "../context.ts";
import type {
  McpToolDescriptor,
  McpToolCallResult,
} from "@/lib/ghl/mcp";
// Identify a missing-PIT error by name so we don't take a runtime import on
// @/lib/ghl/token (server-only) at module load. The error is defined and
// thrown there.
const GHL_PIT_NOT_CONFIGURED_ERROR_NAME = "GhlPitNotConfiguredError";

/**
 * Minimal surface the handler needs from the MCP client. Lets tests inject
 * a plain object without instantiating the real GhlMcpClient.
 */
export interface McpToolHost {
  listTools(): Promise<McpToolDescriptor[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult>;
}

const MAX_AGENT_ITERATIONS = 5;
const HISTORY_FETCH_LIMIT = 10;

/**
 * Maps the operator-facing logical tool names declared in the archetype
 * (`enabledTools: ["sendSms", ...]`) to the substrings we expect in the
 * actual GHL MCP tool name. The probe script confirms exact names per
 * location; the substring match keeps us resilient as GHL renames or
 * versions tools (e.g. `conversations_send-a-new-message` →
 * `messages_send-new`).
 */
const LOGICAL_TOOL_PATTERNS: Record<string, string[]> = {
  sendSms: ["send-a-new-message", "send-message", "send_message"],
  lookupContact: ["get-contact", "find-contact", "contact-get"],
  createTask: ["create-task", "task-create"],
  checkCalendar: ["get-calendar-events", "list-calendar-events", "calendar-events"],
};

export interface LeadQualificationTrigger {
  contactId: string;
  conversationId: string | null;
  inboundText: string;
}

export type LeadQualificationOutcome =
  | "qualification_message_sent"
  | "qualification_completed"
  | "skipped_no_pit"
  | "skipped_no_inbound_text"
  | "skipped_no_enabled_tools"
  | "halted_max_iterations";

export interface LeadQualificationResult {
  outcome: LeadQualificationOutcome;
  iterations: number;
  toolCalls: Array<{ name: string; ok: boolean }>;
  finalText: string | null;
  reason?: string;
}

export interface LeadQualificationHandlerDeps {
  /** Override for tests so we never hit a real GHL MCP server. */
  getMcpClient?: (accountId: string) => Promise<McpToolHost>;
}

export interface LeadQualificationHandlerOptions {
  deps?: LeadQualificationHandlerDeps;
}

export function createLeadQualificationHandler(
  options: LeadQualificationHandlerOptions = {},
) {
  return async function leadQualificationHandler(
    ctx: RecipeContext,
    trigger: LeadQualificationTrigger,
  ): Promise<LeadQualificationResult> {
    if (!trigger.inboundText?.trim()) {
      return emptyResult("skipped_no_inbound_text");
    }

    const enabledLogical = readEnabledTools(ctx.agent.tool_config);
    if (enabledLogical.length === 0) {
      return emptyResult("skipped_no_enabled_tools");
    }

    let mcp: McpToolHost;
    try {
      mcp = await resolveMcpClient(ctx.accountId, options.deps);
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === GHL_PIT_NOT_CONFIGURED_ERROR_NAME
      ) {
        return {
          ...emptyResult("skipped_no_pit"),
          reason: error.message,
        };
      }
      throw error;
    }

    const mcpTools = await mcp.listTools();
    const exposed = selectExposedTools(mcpTools, enabledLogical);
    if (exposed.length === 0) {
      return emptyResult("skipped_no_enabled_tools");
    }

    const tools: Tool[] = exposed.map(toAnthropicTool);
    const messages: MessageParam[] = [
      {
        role: "user",
        content: buildInitialUserMessage(trigger),
      },
    ];

    const toolCalls: Array<{ name: string; ok: boolean }> = [];
    let iterations = 0;
    let lastAssistantText: string | null = null;

    while (iterations < MAX_AGENT_ITERATIONS) {
      iterations += 1;
      const response: Message = await ctx.ai.messages.create({
        model: ctx.agent.model,
        max_tokens: ctx.agent.max_tokens,
        ...(ctx.agent.temperature != null
          ? { temperature: ctx.agent.temperature }
          : {}),
        system: ctx.agent.system_prompt,
        tools,
        messages,
      });

      lastAssistantText = extractText(response);
      messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter(
        (block): block is ToolUseBlock => block.type === "tool_use",
      );

      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        return {
          outcome: classifyOutcome(toolCalls),
          iterations,
          toolCalls,
          finalText: lastAssistantText || null,
        };
      }

      const toolResults: ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const result = await safeCallTool(mcp, use.name, use.input);
        toolCalls.push({ name: use.name, ok: !result.isError });
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: serializeToolResult(result),
          is_error: result.isError ?? false,
        });
      }
      messages.push({ role: "user", content: toolResults });
    }

    return {
      outcome: "halted_max_iterations",
      iterations,
      toolCalls,
      finalText: lastAssistantText,
    };
  };
}

// ── helpers ────────────────────────────────────────────────────────────────

function emptyResult(outcome: LeadQualificationOutcome): LeadQualificationResult {
  return {
    outcome,
    iterations: 0,
    toolCalls: [],
    finalText: null,
  };
}

async function resolveMcpClient(
  accountId: string,
  deps: LeadQualificationHandlerDeps | undefined,
): Promise<McpToolHost> {
  if (deps?.getMcpClient) {
    return deps.getMcpClient(accountId);
  }
  const { getMcpClientForAccount } = await import("@/lib/ghl/mcp");
  return getMcpClientForAccount(accountId);
}

function readEnabledTools(toolConfig: Record<string, unknown>): string[] {
  const raw = toolConfig["enabledTools"];
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}

export function selectExposedTools(
  mcpTools: McpToolDescriptor[],
  enabledLogical: string[],
): McpToolDescriptor[] {
  const matched = new Map<string, McpToolDescriptor>();
  for (const logical of enabledLogical) {
    const patterns = LOGICAL_TOOL_PATTERNS[logical];
    if (!patterns) continue;
    const found = mcpTools.find((t) =>
      patterns.some((pat) => t.name.toLowerCase().includes(pat)),
    );
    if (found && !matched.has(found.name)) {
      matched.set(found.name, found);
    }
  }
  return Array.from(matched.values());
}

function toAnthropicTool(mcp: McpToolDescriptor): Tool {
  return {
    name: mcp.name,
    description: mcp.description,
    input_schema: mcp.inputSchema as Tool["input_schema"],
  };
}

function buildInitialUserMessage(trigger: LeadQualificationTrigger): string {
  const convo = trigger.conversationId
    ? `\nConversation: ${trigger.conversationId}`
    : "";
  return (
    `New inbound SMS from contact ${trigger.contactId}.${convo}\n\n` +
    `Lead said: ${trigger.inboundText.trim()}\n\n` +
    `Decide your next move. Use tools to look up the contact, send a ` +
    `qualification reply, check the calendar, or create a task summarizing ` +
    `qualification once you have the four facts (service, urgency, location, ` +
    `ready-to-book).`
  );
}

function extractText(message: Message): string {
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === "text") parts.push(block.text);
  }
  return parts.join("\n").trim();
}

async function safeCallTool(
  mcp: McpToolHost,
  name: string,
  input: unknown,
): Promise<McpToolCallResult> {
  try {
    return await mcp.callTool(
      name,
      (input ?? {}) as Record<string, unknown>,
    );
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: error instanceof Error ? error.message : String(error),
        },
      ],
      isError: true,
    };
  }
}

function serializeToolResult(result: McpToolCallResult): string {
  // Anthropic's tool_result content accepts either a string or block array.
  // We collapse MCP content blocks to a single string so the model sees a
  // simple JSON-ish payload regardless of upstream formatting.
  const parts: string[] = [];
  for (const block of result.content ?? []) {
    if (block.type === "text") parts.push(block.text);
  }
  if (result.structuredContent !== undefined) {
    parts.push(JSON.stringify(result.structuredContent));
  }
  return parts.join("\n").trim() || (result.isError ? "tool error" : "ok");
}

function classifyOutcome(
  toolCalls: Array<{ name: string; ok: boolean }>,
): LeadQualificationOutcome {
  const usedCreateTask = toolCalls.some(
    (c) => c.ok && /create-task|task-create/i.test(c.name),
  );
  if (usedCreateTask) return "qualification_completed";

  const usedSend = toolCalls.some(
    (c) => c.ok && /send-(a-)?new-message|send-message/i.test(c.name),
  );
  if (usedSend) return "qualification_message_sent";

  return "qualification_message_sent";
}
