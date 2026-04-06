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
