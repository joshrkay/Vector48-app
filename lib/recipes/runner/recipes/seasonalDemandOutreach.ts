import { createSmsRecipeHandler } from "./_smsHandler";

interface SeasonalDemandConfig extends Record<string, unknown> {
  seasonalMessage?: string;
  seasonName?: string;
  campaignStartDate?: string;
  businessName?: string;
}

export function createSeasonalDemandOutreachHandler(
  deps: Parameters<typeof createSmsRecipeHandler<SeasonalDemandConfig>>[0]["deps"] = {},
) {
  return createSmsRecipeHandler<SeasonalDemandConfig>({
    recipeSlug: "seasonal-demand-outreach",
    successOutcome: "seasonal_outreach_sent",
    deps,
    buildPrompt: ({ contact, config }) => {
      const name = contact.firstName ?? contact.name;
      const business = config.businessName ? ` from ${config.businessName}` : "";
      const season = config.seasonName ? ` for ${config.seasonName}` : " for the upcoming season";
      const template = config.seasonalMessage
        ? ` Use this as a reference: "${config.seasonalMessage}".`
        : "";
      return (
        `Write a proactive seasonal outreach SMS${business} to ${name}${season}.${template} ` +
        "Prompt them to book before peak demand. Keep it under 300 characters, warm but direct."
      );
    },
  });
}
