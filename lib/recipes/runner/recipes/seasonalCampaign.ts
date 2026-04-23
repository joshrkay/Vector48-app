import { createSmsRecipeHandler } from "./_smsHandler";

interface SeasonalCampaignConfig extends Record<string, unknown> {
  campaignMessage?: string;
  campaignName?: string;
  businessName?: string;
}

export function createSeasonalCampaignHandler(
  deps: Parameters<typeof createSmsRecipeHandler<SeasonalCampaignConfig>>[0]["deps"] = {},
) {
  return createSmsRecipeHandler<SeasonalCampaignConfig>({
    recipeSlug: "seasonal-campaign",
    successOutcome: "seasonal_campaign_sent",
    deps,
    buildPrompt: ({ contact, config }) => {
      const name = contact.firstName ?? contact.name;
      const business = config.businessName ? ` from ${config.businessName}` : "";
      const campaign = config.campaignName ? ` (${config.campaignName})` : "";
      const template = config.campaignMessage
        ? ` Use this message as guidance: "${config.campaignMessage}".`
        : "";
      return (
        `Write a seasonal campaign SMS${business} to ${name}${campaign}.${template} ` +
        "Promote the seasonal offer with a clear call to action. Under 300 characters."
      );
    },
  });
}
