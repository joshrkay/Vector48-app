// ---------------------------------------------------------------------------
// Execution endpoint authentication — tenant-isolated HMAC tokens.
//
// Each N8N workflow receives a per-account token at provisioning time:
//   RECIPE_EXECUTION_TOKEN = HMAC-SHA256(RECIPE_EXECUTION_SECRET, accountId)
//
// On every call the endpoint extracts accountId from the request, recomputes
// the expected HMAC, and compares via timingSafeEqual.  Passing a different
// accountId produces a different HMAC → 401.  Cross-tenant calls are
// cryptographically impossible.
// ---------------------------------------------------------------------------
import "server-only";

import crypto from "node:crypto";

export const EXECUTION_AUTH_CONFIG_ERROR =
  "RECIPE_EXECUTION_SECRET is required for recipe execution authentication";

function readExecutionSecret(): string {
  return process.env.RECIPE_EXECUTION_SECRET?.trim() ?? "";
}

function getExecutionSecret(): string {
  const secret = readExecutionSecret();
  if (!secret) {
    throw new Error(EXECUTION_AUTH_CONFIG_ERROR);
  }
  return secret;
}

export function getExecutionAuthConfigError(): string | null {
  return readExecutionSecret() ? null : EXECUTION_AUTH_CONFIG_ERROR;
}

function computeExecutionTokenWithSecret(accountId: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(accountId).digest("hex");
}

/**
 * Derive the per-account execution token.
 * Called both at provisioning (to inject into N8N template) and at request
 * time (to validate the Authorization header).
 */
export function computeExecutionToken(accountId: string): string {
  const secret = getExecutionSecret();
  return computeExecutionTokenWithSecret(accountId, secret);
}

/**
 * Validate the `Authorization: Bearer <token>` header against the expected
 * HMAC for the given accountId.
 *
 * Must be called AFTER accountId is extracted from the request — the token is
 * meaningless without knowing which account it is supposed to authenticate.
 */
export function validateExecutionAuth(request: Request, accountId: string): boolean {
  // Ensure secret is configured before we attempt any authorization checks.
  // This throws a config error when missing (callers can convert to HTTP 500).
  getExecutionSecret();
  if (!accountId) return false;
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;
  const expected = computeExecutionTokenWithSecret(accountId, getExecutionSecret());
  try {
    return crypto.timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
  } catch {
    // timingSafeEqual throws when buffers have different lengths
    return false;
  }
}
