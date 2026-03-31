import type { AccountProfileSlice } from "./activationValidator";

export function getAccountProfileValue(
  profile: AccountProfileSlice | null,
  key: string,
): unknown {
  if (!profile) return undefined;
  if (key === "business_hours") return profile.business_hours;
  return (profile as Record<string, unknown>)[key];
}

export function profileValueToDisplayString(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

export function isProfileValuePresent(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === "string") return val.trim().length > 0;
  if (typeof val === "boolean") return true;
  if (typeof val === "object") return Object.keys(val as object).length > 0;
  return true;
}
