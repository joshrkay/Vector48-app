import { createSmsRecipeHandler } from "./_smsHandler";

interface CustomerReactivationConfig extends Record<string, unknown> {
  reactivationMessage?: string;
  inactiveDaysThreshold?: number;
  businessName?: string;
}

export function createCustomerReactivationHandler(
  deps: Parameters<typeof createSmsRecipeHandler<CustomerReactivationConfig>>[0]["deps"] = {},
) {
  return createSmsRecipeHandler<CustomerReactivationConfig>({
    recipeSlug: "customer-reactivation",
    successOutcome: "reactivation_sent",
    deps,
    buildPrompt: ({ contact, config }) => {
      const name = contact.firstName ?? contact.name;
      const business = config.businessName ? ` from ${config.businessName}` : "";
      const template = config.reactivationMessage
        ? ` Incorporate this: "${config.reactivationMessage}".`
        : "";
      return (
        `Write a warm re-engagement SMS${business} for ${name} — a past customer ` +
        `who hasn't booked in ${config.inactiveDaysThreshold ?? 90}+ days.${template} ` +
        "Offer an incentive to book again. Keep it under 300 characters, friendly."
      );
    },
  });
}
