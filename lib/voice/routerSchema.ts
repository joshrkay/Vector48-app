import { z } from "zod";
import { isVoiceRouterAllowedRoute } from "@/lib/prompts/voiceRouter";

export const voiceRouterActionTypeSchema = z.enum([
  "navigate",
  "answer",
  "action",
  "clarify",
]);

const voiceRouterRawSchema = z.object({
  type: voiceRouterActionTypeSchema,
  route: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  message: z.string(),
  confidence: z.number().min(0).max(1),
});

export type VoiceRouterRawAction = z.infer<typeof voiceRouterRawSchema>;

export type VoiceRouterAction = {
  type: "navigate" | "answer" | "action" | "clarify";
  route?: string;
  params?: Record<string, unknown>;
  message: string;
  confidence: number;
};

const CLARIFY_INVALID_ROUTE =
  "I couldn't find that screen. Try asking for contacts, inbox, calendar, or dashboard.";

/**
 * Strips optional markdown code fences from model output before JSON.parse.
 */
export function stripAssistantJsonFence(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith("```")) {
    return t;
  }
  return t
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/m, "")
    .trim();
}

function coerceNavigateRoute(action: VoiceRouterRawAction): VoiceRouterAction {
  if (action.type !== "navigate") {
    return {
      type: action.type,
      params: action.params,
      message: action.message,
      confidence: action.confidence,
    };
  }

  const route = action.route?.trim();
  if (!route || !isVoiceRouterAllowedRoute(route)) {
    return {
      type: "clarify",
      message: CLARIFY_INVALID_ROUTE,
      confidence: Math.min(action.confidence, 0.5),
    };
  }

  return {
    type: "navigate",
    route,
    params: action.params,
    message: action.message,
    confidence: action.confidence,
  };
}

export function parseVoiceRouterModelJson(text: string): VoiceRouterAction {
  const cleaned = stripAssistantJsonFence(text);
  const parsed: unknown = JSON.parse(cleaned);
  const validated = voiceRouterRawSchema.parse(parsed);
  return coerceNavigateRoute(validated);
}
