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
            category: {
              type: "string",
              enum: ["missed_item", "upsell", "pricing_flag"],
              description: "Type of suggestion",
            },
            item: { type: "string", description: "Short title for the suggestion" },
            reason: {
              type: "string",
              description: "Why it matters (1–3 sentences)",
            },
            estimatedValue: {
              type: "number",
              description: "Approximate incremental value in USD",
            },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low"],
              description: "How likely this suggestion applies",
            },
            priority: {
              type: "string",
              enum: ["high", "medium", "low"],
              description: "Customer impact importance",
            },
          },
          required: [
            "category",
            "item",
            "reason",
            "estimatedValue",
            "confidence",
            "priority",
          ],
        },
      },
      summary: {
        type: "string",
        description: "One-sentence overall estimate assessment",
      },
      totalPotentialValue: {
        type: "number",
        description:
          "Sum of all estimatedValue entries (USD); must match the sum of suggestions.",
      },
    },
    required: ["suggestions", "summary", "totalPotentialValue"],
  },
};
