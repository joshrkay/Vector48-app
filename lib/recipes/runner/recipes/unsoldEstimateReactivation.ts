import { createSmsRecipeHandler } from "./_smsHandler";

interface UnsoldEstimateConfig extends Record<string, unknown> {
  reactivationMessage?: string;
  staleDaysThreshold?: number;
  businessName?: string;
}

export function createUnsoldEstimateReactivationHandler(
  deps: Parameters<typeof createSmsRecipeHandler<UnsoldEstimateConfig>>[0]["deps"] = {},
) {
  return createSmsRecipeHandler<UnsoldEstimateConfig>({
    recipeSlug: "unsold-estimate-reactivation",
    successOutcome: "unsold_estimate_followup_sent",
    deps,
    buildPrompt: ({ contact, config }) => {
      const name = contact.firstName ?? contact.name;
      const business = config.businessName ? ` from ${config.businessName}` : "";
      const template = config.reactivationMessage
        ? ` Use this guidance: "${config.reactivationMessage}".`
        : "";
      return (
        `Write a low-pressure follow-up SMS${business} to ${name} about an estimate ` +
        `they received ${config.staleDaysThreshold ?? 14}+ days ago.${template} ` +
        "Ask if they're still interested and offer to answer questions. Under 300 characters."
      );
    },
  });
}
