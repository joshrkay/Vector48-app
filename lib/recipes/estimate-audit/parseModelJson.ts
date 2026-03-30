import { auditModelResponseSchema } from "./schema";

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
  const validated = auditModelResponseSchema.parse(parsed);
  const sum = validated.suggestions.reduce(
    (acc, s) => acc + s.estimatedValue,
    0,
  );
  const rounded = Math.round(sum * 100) / 100;
  return {
    suggestions: validated.suggestions,
    totalPotentialValue: rounded,
  };
}
