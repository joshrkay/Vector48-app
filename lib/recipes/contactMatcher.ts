// ---------------------------------------------------------------------------
// Contact phone normalization — used for matching contacts across formats.
// Handles US/NANP numbers where +1 country code must be stripped for matching.
// ---------------------------------------------------------------------------

/**
 * Normalize a phone number to digits only, stripping the leading +1 for
 * 11-digit NANP (US/Canada) numbers so that all representations of the same
 * number compare equal:
 *
 *   +1(602)555-1234  →  6025551234
 *   +16025551234     →  6025551234
 *   602-555-1234     →  6025551234
 *   6025551234       →  6025551234
 *
 * Non-NANP international numbers (11+ digits not starting with 1, or 12+
 * digits) are returned as raw digits without stripping.
 */
export function normalizePhone(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  // Strip leading 1 for 11-digit NANP numbers (1XXXXXXXXXX → XXXXXXXXXX)
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
}

/**
 * Returns true when two phone strings normalize to the same non-empty 10-digit
 * (or longer international) number.
 */
export function phonesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  return na.length >= 10 && na === nb;
}
