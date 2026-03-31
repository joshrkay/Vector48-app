import { auditModelResponseSchema } from "./schema";

function roundToNearest25(value: number): number {
  return Math.round(value / 25) * 25;
}

function normalizeAuditModelResponse(input: unknown) {
  const validated = auditModelResponseSchema.parse(input);
  const suggestions = validated.suggestions.map((suggestion) => ({
    ...suggestion,
    estimatedValue: roundToNearest25(suggestion.estimatedValue),
  }));
  const sum = suggestions.reduce((acc, suggestion) => acc + suggestion.estimatedValue, 0);
  return {
    suggestions,
    summary: validated.summary,
    totalPotentialValue: Math.round(sum * 100) / 100,
  };
}

/**
 * Validates structured output from Anthropic tool_use input.
 */
export function parseEstimateAuditToolInput(input: unknown) {
  return normalizeAuditModelResponse(input);
}

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

export function parseEstimateAuditModelJson(text: string) {
  const cleaned = stripAssistantJsonFence(text);
  const parsed: unknown = JSON.parse(cleaned);
  return normalizeAuditModelResponse(parsed);
}
