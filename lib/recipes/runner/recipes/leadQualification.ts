import { createSmsRecipeHandler } from "./_smsHandler.ts";

interface LeadQualificationConfig extends Record<string, unknown> {
  qualificationQuestions?: string;
  qualifiedTag?: string;
  unqualifiedTag?: string;
  businessName?: string;
}

export function createLeadQualificationHandler(
  deps: Parameters<typeof createSmsRecipeHandler<LeadQualificationConfig>>[0]["deps"] = {},
) {
  return createSmsRecipeHandler<LeadQualificationConfig>({
    recipeSlug: "lead-qualification",
    successOutcome: "qualification_message_sent",
    deps,
    buildPrompt: ({ contact, config }) => {
      const name = contact.firstName ?? contact.name;
      const business = config.businessName ? ` from ${config.businessName}` : "";
      const questions = config.qualificationQuestions
        ? ` Ask the top 2-3 of these: ${config.qualificationQuestions}`
        : " Ask about type of work, timeline, and budget range.";
      return (
        `Write a concise qualification SMS${business} to ${name}.${questions} ` +
        "Keep it warm and conversational. Under 300 characters."
      );
    },
  });
}
