import type { GHLContact } from "@/lib/ghl/types";

// ── Stage ──────────────────────────────────────────────────────────────────

export const STAGE_TAGS = [
  "New Lead",
  "Contacted",
  "Active Customer",
  "Inactive",
] as const;

export type StageTag = (typeof STAGE_TAGS)[number];

export const STAGE_CONFIG: Record<StageTag, { label: string; className: string }> = {
  "New Lead":        { label: "New Lead",        className: "bg-blue-100 text-blue-700" },
  "Contacted":       { label: "Contacted",        className: "bg-yellow-100 text-yellow-700" },
  "Active Customer": { label: "Active Customer",  className: "bg-green-100 text-green-700" },
  "Inactive":        { label: "Inactive",         className: "bg-gray-100 text-gray-600" },
};

/** Returns the first stage-tag found on the contact, or null. */
export function deriveStage(tags: string[]): StageTag | null {
  for (const stage of STAGE_TAGS) {
    if (tags.includes(stage)) return stage;
  }
  return null;
}

/** Returns all tags that are NOT stage tags. */
export function nonStageTags(tags: string[]): string[] {
  const stageSet = new Set<string>(STAGE_TAGS);
  return tags.filter((t) => !stageSet.has(t));
}

// ── Display helpers ────────────────────────────────────────────────────────

export function displayName(contact: GHLContact): string {
  return (
    contact.name?.trim() ||
    `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() ||
    "Unknown"
  );
}

export function getInitials(contact: GHLContact): string {
  const first = contact.firstName?.[0] ?? "";
  const last = contact.lastName?.[0] ?? "";
  return (first + last).toUpperCase() || "?";
}

// ── Time ───────────────────────────────────────────────────────────────────

/**
 * Formats a UTC ISO date string as a relative time label.
 * Examples: "just now", "5m ago", "2h ago", "3d ago", "Jan 15"
 */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const thisYear = new Date().getFullYear();
  const dateYear = new Date(iso).getFullYear();
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(dateYear !== thisYear ? { year: "numeric" } : {}),
  });
}

// ── Phone normalization ────────────────────────────────────────────────────

/**
 * Normalizes a phone to 10 digits for comparison (strips non-digits, strips
 * leading "1" from 11-digit US numbers). Returns null if not exactly 10 digits.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  const trimmed =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return trimmed.length === 10 ? trimmed : null;
}

/**
 * True when recipe_activations.config.phone matches the GHL contact phone
 * using the same normalization as search / GHL-08 (10-digit US).
 */
export function activationConfigPhoneMatchesContact(
  contactPhone: string | null | undefined,
  config: Record<string, unknown> | null | undefined,
): boolean {
  const raw =
    config?.phone === undefined || config?.phone === null
      ? ""
      : String(config.phone);
  const c = normalizePhone(contactPhone);
  const a = normalizePhone(raw);
  return c !== null && a !== null && c === a;
}
