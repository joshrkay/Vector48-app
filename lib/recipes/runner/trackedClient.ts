// ---------------------------------------------------------------------------
// Tracked Anthropic Client
//
// Wraps `client.messages.create()` so every call writes a row to
// llm_usage_events with token counts and computed cost. The wrapper also
// runs the per-agent spend cap check before the network round-trip.
//
// Usage:
//   const ai = createTrackedAnthropic({ accountId, agent, recipeSlug });
//   const result = await ai.messages.create({ model, max_tokens, messages });
//
// The returned object exposes only `messages.create` because the recipe
// runner doesn't need anything else from the SDK. Add fields here if a
// recipe needs them (e.g. streaming, tool-use loops).
// ---------------------------------------------------------------------------

import Anthropic from "@anthropic-ai/sdk";
import type { Message, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { computeCostMicros } from "./pricing";
import { enforceSpendCap, type AgentSpendInfo } from "./spendCap";

let sharedClient: Anthropic | null = null;

function getSharedAnthropic(): Anthropic {
  if (sharedClient) return sharedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — required by the recipe runner.",
    );
  }
  sharedClient = new Anthropic({ apiKey });
  return sharedClient;
}

export interface TrackedClientOptions {
  accountId: string;
  recipeSlug: string;
  /**
   * The tenant_agents row driving this call. Pricing model and spend cap
   * come from here, and tenant_agent_id is recorded on the usage event.
   */
  agent: AgentSpendInfo & { id: string };
  /**
   * Optional trigger correlation id (recipe_triggers.id) so we can join
   * usage events back to the trigger that fired them.
   */
  triggerId?: string | null;
  /**
   * Inject a fake Anthropic client for tests. Production code never sets this.
   */
  client?: Pick<Anthropic, "messages">;
}

export interface TrackedAnthropic {
  messages: {
    create: (params: MessageCreateParamsNonStreaming) => Promise<Message>;
  };
}

export function createTrackedAnthropic(
  options: TrackedClientOptions,
): TrackedAnthropic {
  const client = options.client ?? getSharedAnthropic();

  return {
    messages: {
      async create(params: MessageCreateParamsNonStreaming): Promise<Message> {
        // Pre-call: spend cap. Throws SpendCapExceededError if over budget.
        await enforceSpendCap(options.agent);

        const response = await client.messages.create(params);

        // Best-effort usage logging. Anthropic returns `usage` on every
        // non-streaming response. We never throw from logging — losing one
        // usage event is preferable to dropping a successful recipe run.
        try {
          await recordUsage({
            accountId: options.accountId,
            agentId: options.agent.id,
            recipeSlug: options.recipeSlug,
            triggerId: options.triggerId ?? null,
            model: params.model,
            usage: response.usage,
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(
            `[recipes/runner/trackedClient] failed to log usage for ${options.accountId}/${options.recipeSlug}:`,
            err,
          );
        }

        return response;
      },
    },
  };
}

interface RecordUsageInput {
  accountId: string;
  agentId: string;
  recipeSlug: string;
  triggerId: string | null;
  model: string;
  usage: Message["usage"];
}

async function recordUsage(input: RecordUsageInput): Promise<void> {
  const inputTokens = input.usage.input_tokens ?? 0;
  const outputTokens = input.usage.output_tokens ?? 0;
  const cacheReadTokens = input.usage.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = input.usage.cache_creation_input_tokens ?? 0;

  const cost = computeCostMicros(input.model, {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
  });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("llm_usage_events").insert({
    account_id: input.accountId,
    tenant_agent_id: input.agentId,
    recipe_slug: input.recipeSlug,
    model: input.model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_tokens: cacheReadTokens,
    cache_write_tokens: cacheWriteTokens,
    cost_micros: cost,
    trigger_id: input.triggerId,
  });

  if (error) throw error;
}
