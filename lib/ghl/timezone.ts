// ---------------------------------------------------------------------------
// Timezone inference from US state abbreviation
// Used by GHL provisioning to set sub-account timezone from service_area
// ---------------------------------------------------------------------------

const STATE_TIMEZONE: Record<string, string> = {
  HI: "Pacific/Honolulu",
  AK: "America/Anchorage",
  WA: "America/Los_Angeles",
  OR: "America/Los_Angeles",
  CA: "America/Los_Angeles",
  NV: "America/Los_Angeles",
  ID: "America/Boise",
  MT: "America/Denver",
  WY: "America/Denver",
  UT: "America/Denver",
  CO: "America/Denver",
  AZ: "America/Phoenix",
  NM: "America/Denver",
  ND: "America/Chicago",
  SD: "America/Chicago",
  NE: "America/Chicago",
  KS: "America/Chicago",
  OK: "America/Chicago",
  TX: "America/Chicago",
  MN: "America/Chicago",
  IA: "America/Chicago",
  MO: "America/Chicago",
  AR: "America/Chicago",
  LA: "America/Chicago",
  WI: "America/Chicago",
  IL: "America/Chicago",
  MS: "America/Chicago",
  AL: "America/Chicago",
  TN: "America/Chicago",
  KY: "America/New_York",
  IN: "America/Indiana/Indianapolis",
  MI: "America/Detroit",
  OH: "America/New_York",
  WV: "America/New_York",
  VA: "America/New_York",
  NC: "America/New_York",
  SC: "America/New_York",
  GA: "America/New_York",
  FL: "America/New_York",
  PA: "America/New_York",
  NY: "America/New_York",
  NJ: "America/New_York",
  DE: "America/New_York",
  MD: "America/New_York",
  DC: "America/New_York",
  CT: "America/New_York",
  RI: "America/New_York",
  MA: "America/New_York",
  VT: "America/New_York",
  NH: "America/New_York",
  ME: "America/New_York",
};

const STATE_REGEX = new RegExp(
  `\\b(${Object.keys(STATE_TIMEZONE).join("|")})\\b`,
);

/**
 * Infer an IANA timezone string from a free-text service area description.
 * Looks for a US state abbreviation in the string.
 *
 * @example inferTimezone("Dallas, TX") → "America/Chicago"
 * @example inferTimezone("Phoenix, AZ") → "America/Phoenix"
 * @example inferTimezone(null) → "America/New_York"
 */
export function inferTimezone(serviceArea: string | null): string {
  if (!serviceArea) return "America/New_York";
  const match = serviceArea.toUpperCase().match(STATE_REGEX);
  if (match) return STATE_TIMEZONE[match[1]] ?? "America/New_York";
  return "America/New_York";
}
