// ---------------------------------------------------------------------------
// Test SMS validation helpers.
//
// The `/api/settings/notifications/test-sms` route needs to verify four
// preconditions before it attempts a real SMS send:
//   1. the caller is authenticated (checked in the route via requireAccountForUser)
//   2. a phone number is available — either supplied in the request body or
//      pulled from accounts.notification_contact_phone
//   3. the phone is plausibly a real number (10+ digits after normalization)
//   4. the account has a GHL connection (pulled from accounts.ghl_location_id)
//
// We extract these into a pure helper so the validation is unit-testable
// without standing up a Supabase client or a Next request.
// ---------------------------------------------------------------------------

export type TestSmsValidationOk = { ok: true; phone: string };

export type TestSmsValidationFail = {
  ok: false;
  status: 400 | 503;
  code: "no_phone" | "invalid_phone" | "ghl_not_connected";
  message: string;
};

export interface TestSmsAccountContext {
  /** From request body; null when the UI did not pass one. */
  requestedPhone: string | null | undefined;
  /** From accounts.notification_contact_phone. */
  storedPhone: string | null | undefined;
  /** From accounts.ghl_location_id. Non-null means the tenant has connected GHL. */
  ghlLocationId: string | null | undefined;
}

/**
 * Normalize a phone number to digits only. Returns null if the result has
 * fewer than 10 digits. Keeps +1 / parens / dashes out of the validation
 * path — GHL handles formatting downstream.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits;
}

/**
 * Decide whether a test-SMS request can proceed. Pure, deterministic, and
 * side-effect-free so the route handler can log + return the error without
 * a Supabase round trip.
 */
export function validateTestSmsRequest(
  ctx: TestSmsAccountContext,
): TestSmsValidationOk | TestSmsValidationFail {
  const raw = ctx.requestedPhone?.trim() || ctx.storedPhone?.trim() || null;
  if (!raw) {
    return {
      ok: false,
      status: 400,
      code: "no_phone",
      message:
        "No phone number on file. Add a notification contact in settings or pass one in the request body.",
    };
  }

  const normalized = normalizePhone(raw);
  if (!normalized) {
    return {
      ok: false,
      status: 400,
      code: "invalid_phone",
      message: "Phone number is too short to send a test SMS.",
    };
  }

  if (!ctx.ghlLocationId) {
    return {
      ok: false,
      status: 503,
      code: "ghl_not_connected",
      message:
        "GoHighLevel is not connected for this account. Connect in Settings → Integrations before sending a test SMS.",
    };
  }

  return { ok: true, phone: normalized };
}
