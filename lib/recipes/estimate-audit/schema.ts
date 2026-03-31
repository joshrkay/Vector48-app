import { z } from "zod";

export const estimateAuditVerticalSchema = z.enum([
  "hvac",
  "plumbing",
  "electrical",
  "roofing",
  "landscaping",
]);

export const analyzeBodySchema = z.object({
  estimateText: z.string().max(200_000),
  vertical: estimateAuditVerticalSchema,
  jobType: z.string().min(1).max(500),
});

export const auditSuggestionSchema = z.object({
  category: z.enum(["missed_item", "upsell", "pricing_flag"]),
  item: z.string(),
  reason: z.string(),
  estimatedValue: z.number(),
  confidence: z.enum(["high", "medium", "low"]),
  priority: z.enum(["high", "medium", "low"]),
});

export const auditModelResponseSchema = z.object({
  suggestions: z.array(auditSuggestionSchema),
  summary: z.string(),
  totalPotentialValue: z.number(),
});

export const acceptBodySchema = z.object({
  auditLogId: z.string().uuid(),
  acceptedSuggestions: z.array(auditSuggestionSchema),
});

export type AuditSuggestion = z.infer<typeof auditSuggestionSchema>;
