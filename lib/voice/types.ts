import { z } from "zod";

const routeSchema = z.string().min(1).refine((value) => value.startsWith("/"), {
  message: "route must start with '/'",
});

const queryValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const voiceNavigateActionSchema = z.object({
  type: z.literal("navigate"),
  route: routeSchema,
  params: z.record(queryValueSchema).optional(),
  message: z.string().min(1).max(500),
});

export const voiceAnswerActionSchema = z.object({
  type: z.literal("answer"),
  message: z.string().min(1).max(1_500),
  openRoute: routeSchema.optional(),
});

export const voiceClarifyActionSchema = z.object({
  type: z.literal("clarify"),
  message: z.string().min(1).max(1_500),
  openRoute: routeSchema.optional(),
});

const voiceActionBaseSchema = z.object({
  type: z.literal("action"),
  message: z.string().min(1).max(500),
  requiresConfirmation: z.literal(true),
});

const recipeActivateSchema = z.object({
  action: z.literal("recipe.activate"),
  params: z.object({
    recipeSlug: z.string().min(1),
  }),
});

const recipeDeactivateSchema = z.object({
  action: z.literal("recipe.deactivate"),
  params: z.object({
    recipeSlug: z.string().min(1),
  }),
});

const crmContactCreateSchema = z.object({
  action: z.literal("crm.contact.create"),
  params: z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    phone: z.string().min(3).optional(),
    email: z.string().email().optional(),
    tags: z.array(z.string().min(1)).optional(),
    source: z.string().min(1).optional(),
  }),
});

const crmContactUpdateSchema = z.object({
  action: z.literal("crm.contact.update"),
  params: z.object({
    contactId: z.string().min(1),
    patch: z.record(z.unknown()),
  }),
});

const crmContactAddNoteSchema = z.object({
  action: z.literal("crm.contact.add_note"),
  params: z.object({
    contactId: z.string().min(1),
    body: z.string().min(1),
  }),
});

const crmConversationSendMessageSchema = z.object({
  action: z.literal("crm.conversation.send_message"),
  params: z.object({
    conversationId: z.string().min(1),
    contactId: z.string().min(1),
    message: z.string().min(1),
    type: z.string().min(1).optional(),
  }),
});

const crmOpportunityCreateSchema = z.object({
  action: z.literal("crm.opportunity.create"),
  params: z.object({
    contactId: z.string().min(1),
    pipelineId: z.string().min(1),
    pipelineStageId: z.string().min(1),
    jobType: z.string().min(1),
    monetaryValue: z.number().optional(),
    notes: z.string().optional(),
  }),
});

const crmOpportunityUpdateSchema = z.object({
  action: z.literal("crm.opportunity.update"),
  params: z.object({
    opportunityId: z.string().min(1),
    patch: z.record(z.unknown()),
  }),
});

const crmOpportunityUpdateStageSchema = z.object({
  action: z.literal("crm.opportunity.update_stage"),
  params: z.object({
    opportunityId: z.string().min(1),
    pipelineStageId: z.string().min(1),
  }),
});

const crmOpportunityUpdateStatusSchema = z.object({
  action: z.literal("crm.opportunity.update_status"),
  params: z.object({
    opportunityId: z.string().min(1),
    status: z.enum(["won", "lost"]),
  }),
});

const crmAppointmentCreateSchema = z.object({
  action: z.literal("crm.appointment.create"),
  params: z.object({
    calendarId: z.string().min(1),
    contactId: z.string().min(1),
    startTime: z.string().min(1),
    endTime: z.string().min(1),
    title: z.string().optional(),
  }),
});

const voiceMutationSchema = z.discriminatedUnion("action", [
  recipeActivateSchema,
  recipeDeactivateSchema,
  crmContactCreateSchema,
  crmContactUpdateSchema,
  crmContactAddNoteSchema,
  crmConversationSendMessageSchema,
  crmOpportunityCreateSchema,
  crmOpportunityUpdateSchema,
  crmOpportunityUpdateStageSchema,
  crmOpportunityUpdateStatusSchema,
  crmAppointmentCreateSchema,
]);

const voiceActionMutationVariantSchemas = voiceMutationSchema.options.map((schema) =>
  voiceActionBaseSchema.merge(schema),
);

export const voiceActionMutationSchema = z.discriminatedUnion(
  "action",
  voiceActionMutationVariantSchemas,
);

export const voiceActionSchema = z.union([
  voiceNavigateActionSchema,
  voiceAnswerActionSchema,
  voiceClarifyActionSchema,
  ...voiceActionMutationVariantSchemas,
]);

export const voiceQueryContextSchema = z.object({
  vertical: z
    .enum(["hvac", "plumbing", "electrical", "roofing", "landscaping"])
    .nullable()
    .optional(),
  activeRecipes: z.array(z.string().min(1)).optional().default([]),
  currentRoute: routeSchema.optional().default("/dashboard"),
  accountId: z.string().uuid().optional(),
});

export const voiceQueryBodySchema = z.object({
  transcript: z.string().min(1).max(2_000),
  context: voiceQueryContextSchema.optional().default({}),
});

export type VoiceAction = z.infer<typeof voiceActionSchema>;
export type VoiceMutationAction = z.infer<typeof voiceActionMutationSchema>;
export type VoiceMutationOperation = VoiceMutationAction["action"];
export type VoiceQueryBody = z.infer<typeof voiceQueryBodySchema>;

export function parseVoiceActionPayload(input: unknown): VoiceAction {
  return voiceActionSchema.parse(input);
}
