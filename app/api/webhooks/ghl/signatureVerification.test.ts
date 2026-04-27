import assert from "node:assert/strict";
import crypto from "crypto";
import test from "node:test";

import { authenticateGhlWebhook, type GhlPublicKeys } from "./signatureVerification.ts";

function generateTestKeys(): { keys: GhlPublicKeys; ed25519PrivateKey: crypto.KeyObject; rsaPrivateKey: crypto.KeyObject } {
  const ed25519 = crypto.generateKeyPairSync("ed25519");
  const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });

  return {
    keys: {
      ed25519: ed25519.publicKey.export({ type: "spki", format: "pem" }).toString(),
      rsa: rsa.publicKey.export({ type: "spki", format: "pem" }).toString(),
    },
    ed25519PrivateKey: ed25519.privateKey,
    rsaPrivateKey: rsa.privateKey,
  };
}

test("accepts valid Ed25519 signature", () => {
  const payload = JSON.stringify({ event: "ContactCreate", locationId: "loc_123" });
  const { keys, ed25519PrivateKey } = generateTestKeys();
  const signature = crypto.sign(null, Buffer.from(payload, "utf8"), ed25519PrivateKey).toString("base64");

  const headers = new Headers({ "x-ghl-signature": signature });
  const result = authenticateGhlWebhook(payload, headers, { keys });

  assert.deepEqual(result, { ok: true, mode: "signed" });
});

test("accepts valid legacy RSA signature", () => {
  const payload = JSON.stringify({ event: "ContactUpdate", locationId: "loc_123" });
  const { keys, rsaPrivateKey } = generateTestKeys();

  const signer = crypto.createSign("SHA256");
  signer.update(payload);
  const signature = signer.sign(rsaPrivateKey, "base64");

  const headers = new Headers({ "x-wh-signature": signature });
  const result = authenticateGhlWebhook(payload, headers, { keys });

  assert.deepEqual(result, { ok: true, mode: "signed" });
});

test("rejects missing signature by default", () => {
  const payload = JSON.stringify({ event: "ContactUpdate", locationId: "loc_123" });

  const result = authenticateGhlWebhook(payload, new Headers());

  assert.deepEqual(result, { ok: false, reason: "missing_signature" });
});

test("rejects invalid signature", () => {
  const payload = JSON.stringify({ event: "ContactUpdate", locationId: "loc_123" });
  const headers = new Headers({ "x-ghl-signature": "invalid-signature" });

  const result = authenticateGhlWebhook(payload, headers);

  assert.equal(result.ok, false);
  assert.notEqual(result.reason, "missing_signature");
});


test("allows unsigned test request only with explicit flag and test secret", () => {
  const payload = JSON.stringify({ event: "ContactUpdate", locationId: "loc_123" });
  const headers = new Headers({ "x-ghl-test-secret": "local-test-secret" });

  const result = authenticateGhlWebhook(payload, headers, {
    allowUnsigned: "true",
    testSecret: "local-test-secret",
  });

  assert.deepEqual(result, { ok: true, mode: "unsigned_test" });
});

// ── production-environment matrix ─────────────────────────────────────────
//
// The unsigned-test bypass must be available on Vercel preview deploys (so
// the synthetic webhook tester can run against any preview URL) but blocked
// on the actual production domain. Vercel sets NODE_ENV=production for both,
// so we gate on VERCEL_ENV when present.
//
// Each test snapshots and restores both env vars to avoid leaking state.

function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void,
): void {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key];
    if (vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key];
    }
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

const validUnsignedRequest = () => {
  const payload = JSON.stringify({ event: "InboundMessage", locationId: "loc" });
  const headers = new Headers({ "x-ghl-test-secret": "secret" });
  return { payload, headers };
};

test("Vercel production blocks the unsigned bypass even with valid test secret", () => {
  withEnv(
    { NODE_ENV: "production", VERCEL_ENV: "production" },
    () => {
      const { payload, headers } = validUnsignedRequest();
      const result = authenticateGhlWebhook(payload, headers, {
        allowUnsigned: "true",
        testSecret: "secret",
      });
      assert.deepEqual(result, { ok: false, reason: "missing_signature" });
    },
  );
});

test("Vercel preview allows the unsigned bypass with valid test secret", () => {
  withEnv(
    { NODE_ENV: "production", VERCEL_ENV: "preview" },
    () => {
      const { payload, headers } = validUnsignedRequest();
      const result = authenticateGhlWebhook(payload, headers, {
        allowUnsigned: "true",
        testSecret: "secret",
      });
      assert.deepEqual(result, { ok: true, mode: "unsigned_test" });
    },
  );
});

test("Vercel preview rejects the unsigned bypass with a wrong test secret", () => {
  withEnv(
    { NODE_ENV: "production", VERCEL_ENV: "preview" },
    () => {
      const payload = JSON.stringify({ event: "InboundMessage" });
      const headers = new Headers({ "x-ghl-test-secret": "wrong" });
      const result = authenticateGhlWebhook(payload, headers, {
        allowUnsigned: "true",
        testSecret: "secret",
      });
      assert.equal(result.ok, false);
      // Header was provided but didn't match — the guard treats it the same
      // as no header at all rather than leaking which knob is wrong.
      assert.equal(
        (result as { reason: string }).reason,
        "unsigned_test_not_allowed",
      );
    },
  );
});

test("Non-Vercel CI (NODE_ENV=test, VERCEL_ENV unset) allows the unsigned bypass", () => {
  withEnv(
    { NODE_ENV: "test", VERCEL_ENV: undefined },
    () => {
      const { payload, headers } = validUnsignedRequest();
      const result = authenticateGhlWebhook(payload, headers, {
        allowUnsigned: "true",
        testSecret: "secret",
      });
      assert.deepEqual(result, { ok: true, mode: "unsigned_test" });
    },
  );
});

test("Non-Vercel production (e.g. self-hosted) still blocks via NODE_ENV fallback", () => {
  withEnv(
    { NODE_ENV: "production", VERCEL_ENV: undefined },
    () => {
      const { payload, headers } = validUnsignedRequest();
      const result = authenticateGhlWebhook(payload, headers, {
        allowUnsigned: "true",
        testSecret: "secret",
      });
      assert.deepEqual(result, { ok: false, reason: "missing_signature" });
    },
  );
});
