import { createSmsRecipeHandler } from "./_smsHandler.ts";

interface MaintenancePlanConfig extends Record<string, unknown> {
  maintenancePlanMessage?: string;
  maintenancePlanLink?: string;
  enrollmentDelayDays?: number;
  businessName?: string;
}

export function createMaintenancePlanEnrollmentHandler(
  deps: Parameters<typeof createSmsRecipeHandler<MaintenancePlanConfig>>[0]["deps"] = {},
) {
  return createSmsRecipeHandler<MaintenancePlanConfig>({
    recipeSlug: "maintenance-plan-enrollment",
    successOutcome: "enrollment_sent",
    deps,
    buildPrompt: ({ contact, config }) => {
      const name = contact.firstName ?? contact.name;
      const business = config.businessName ? ` from ${config.businessName}` : "";
      const template = config.maintenancePlanMessage
        ? ` Use this message as guidance: "${config.maintenancePlanMessage}".`
        : "";
      const link = config.maintenancePlanLink
        ? ` Include sign-up link: ${config.maintenancePlanLink}.`
        : "";
      return (
        `Write a friendly SMS${business} to ${name} promoting our recurring maintenance plan.${template}${link} ` +
        "Highlight priority scheduling and savings. Keep it under 300 characters."
      );
    },
  });
}
