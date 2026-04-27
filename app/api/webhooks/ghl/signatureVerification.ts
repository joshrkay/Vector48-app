import crypto from "crypto";

export type GhlPublicKeys = {
  ed25519: string;
  rsa: string;
};

// GHL signs webhook deliveries with asymmetric keys — no shared secret needed.
// Prefer X-GHL-Signature (Ed25519, current). X-WH-Signature (RSA-SHA256) is the
// legacy fallback and will be deprecated July 1, 2026.
// Public keys sourced from the official GHL developer docs:
// https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide
export const GHL_PUBLIC_KEYS: GhlPublicKeys = {
  ed25519: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`,
  rsa: `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSC
Frm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6
dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfB
csedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpv
uxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF
3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKU
J062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXp
IocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzN
h/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELh
CHULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sY
JPQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAy
kT1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==
-----END PUBLIC KEY-----`,
};

type SignatureVerificationResult =
  | { ok: true; algorithm: "ed25519" | "rsa" }
  | {
      ok: false;
      reason:
        | "missing_signature"
        | "invalid_ed25519_signature"
        | "invalid_rsa_signature"
        | "invalid_signature";
    };

export function verifyGhlSignature(
  rawBody: string,
  headers: Headers,
  keys: GhlPublicKeys = GHL_PUBLIC_KEYS
): SignatureVerificationResult {
  const ghlSig = headers.get("x-ghl-signature");
  const legacySig = headers.get("x-wh-signature");

  if (ghlSig) {
    try {
      const payloadBuffer = Buffer.from(rawBody, "utf8");
      const signatureBuffer = Buffer.from(ghlSig, "base64");
      const ok = crypto.verify(null, payloadBuffer, keys.ed25519, signatureBuffer);
      return ok
        ? { ok: true, algorithm: "ed25519" }
        : { ok: false, reason: "invalid_ed25519_signature" };
    } catch {
      return { ok: false, reason: "invalid_signature" };
    }
  }

  if (legacySig) {
    try {
      const verifier = crypto.createVerify("SHA256");
      verifier.update(rawBody);
      const ok = verifier.verify(keys.rsa, legacySig, "base64");
      return ok ? { ok: true, algorithm: "rsa" } : { ok: false, reason: "invalid_rsa_signature" };
    } catch {
      return { ok: false, reason: "invalid_signature" };
    }
  }

  return { ok: false, reason: "missing_signature" };
}

function equalsConstantTime(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export function authenticateGhlWebhook(
  rawBody: string,
  headers: Headers,
  options?: {
    keys?: GhlPublicKeys;
    allowUnsigned?: string;
    testSecret?: string;
  }
):
  | { ok: true; mode: "signed" | "unsigned_test" }
  | {
      ok: false;
      reason:
        | "missing_signature"
        | "invalid_ed25519_signature"
        | "invalid_rsa_signature"
        | "invalid_signature"
        | "unsigned_test_not_allowed";
    } {
  const signatureResult = verifyGhlSignature(rawBody, headers, options?.keys);

  if (signatureResult.ok) {
    return { ok: true, mode: "signed" };
  }

  if (signatureResult.reason !== "missing_signature") {
    return { ok: false, reason: signatureResult.reason };
  }

  const allowUnsigned = options?.allowUnsigned ?? process.env.GHL_WEBHOOK_ALLOW_UNSIGNED;
  const testSecret = options?.testSecret ?? process.env.GHL_WEBHOOK_TEST_SECRET;
  const providedTestSecret = headers.get("x-ghl-test-secret");

  // Refuse the unsigned-test bypass in production no matter what env vars are set.
  // A leaked GHL_WEBHOOK_ALLOW_UNSIGNED=true must never accept unsigned traffic in prod.
  //
  // Vercel sets NODE_ENV=production for both production AND preview deploys, so
  // gating on NODE_ENV alone would block synthetic webhook tests against preview
  // URLs. VERCEL_ENV differentiates: "production" only on the prod domain,
  // "preview" on PR/branch deploys, "development" on `vercel dev`.
  //
  // VERCEL_ENV is only authoritative when we know we're actually on a Vercel
  // runtime (Vercel sets VERCEL=1 itself; it isn't user-configurable in normal
  // setups). Without that gate, a leaked VERCEL_ENV=preview on a self-hosted
  // production deploy could re-enable the bypass even though NODE_ENV=production.
  // Outside Vercel, fall back to NODE_ENV. On Vercel with VERCEL_ENV unset
  // (shouldn't happen but defend in depth), assume production.
  const onVercel = process.env.VERCEL === "1";
  const effectiveEnv = onVercel
    ? (process.env.VERCEL_ENV ?? "production")
    : process.env.NODE_ENV;
  if (effectiveEnv === "production") {
    return { ok: false, reason: "missing_signature" };
  }

  if (
    allowUnsigned === "true" &&
    typeof testSecret === "string" &&
    testSecret.length > 0 &&
    typeof providedTestSecret === "string" &&
    equalsConstantTime(testSecret, providedTestSecret)
  ) {
    return { ok: true, mode: "unsigned_test" };
  }

  return {
    ok: false,
    reason: allowUnsigned === "true" ? "unsigned_test_not_allowed" : "missing_signature",
  };
}
