import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";

export const ESTIMATE_AUDIT_TOOL_NAME = "submit_estimate_audit" as const;

/**
 * Forces Claude to return structured audit output via tool_use (validated input shape).
 */
export const estimateAuditSubmitTool: Tool = {
  name: ESTIMATE_AUDIT_TOOL_NAME,
  description:
    "Submit the complete estimate audit: missed line items, upsells, and pricing notes. Call exactly once per analysis.",
  input_schema: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        description:
          "Suggestions for the business owner; each has a title, explanation, and approximate USD value.",
        items: {
          type: "object",
          properties: {
            item: { type: "string", description: "Short title for the suggestion" },
            reason: {
              type: "string",
              description: "Why it matters (1–3 sentences)",
            },
            estimatedValue: {
              type: "number",
              description: "Approximate incremental value in USD",
            },
          },
          required: ["item", "reason", "estimatedValue"],
        },
      },
      totalPotentialValue: {
        type: "number",
        description:
          "Sum of all estimatedValue entries (USD); must match the sum of suggestions.",
      },
    },
    required: ["suggestions", "totalPotentialValue"],
  },
};
