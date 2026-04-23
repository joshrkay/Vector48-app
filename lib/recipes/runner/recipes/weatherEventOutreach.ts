import { createSmsRecipeHandler } from "./_smsHandler";

interface WeatherEventConfig extends Record<string, unknown> {
  weatherMessage?: string;
  weatherEventType?: string;
  businessName?: string;
}

export function createWeatherEventOutreachHandler(
  deps: Parameters<typeof createSmsRecipeHandler<WeatherEventConfig>>[0]["deps"] = {},
) {
  return createSmsRecipeHandler<WeatherEventConfig>({
    recipeSlug: "weather-event-outreach",
    successOutcome: "weather_outreach_sent",
    deps,
    buildPrompt: ({ contact, config }) => {
      const name = contact.firstName ?? contact.name;
      const business = config.businessName ? ` from ${config.businessName}` : "";
      const event = config.weatherEventType
        ? ` after the recent ${config.weatherEventType.replace(/_/g, " ")}`
        : " after the recent storm";
      const template = config.weatherMessage
        ? ` Use this as reference: "${config.weatherMessage}".`
        : "";
      return (
        `Write a caring post-weather outreach SMS${business} to ${name}${event}.${template} ` +
        "Offer a free inspection or priority scheduling. Keep it under 300 characters, empathetic."
      );
    },
  });
}
