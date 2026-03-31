import { createCipheriv, randomBytes } from "node:crypto";
import { describe, it, expect, beforeEach } from "vitest";
import { decryptToken, encryptToken } from "./token";

const KEY_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function encryptLegacyFormat(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(KEY_HEX, "hex"), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]).toString("base64");
}

describe("ghl token compatibility", () => {
  beforeEach(() => {
    process.env.GHL_TOKEN_ENCRYPTION_KEY = KEY_HEX;
    delete process.env.GHL_ENCRYPTION_KEY;
  });

  it("decryptToken reads GHL_TOKEN_ENCRYPTION_KEY and supports legacy base64(iv+ciphertext+tag)", () => {
    const encrypted = encryptLegacyFormat("legacy-token-value");
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe("legacy-token-value");
  });

  it("encryptToken writes legacy base64 format and round-trips with decryptToken", () => {
    const encrypted = encryptToken("new-token-value");
    expect(encrypted.includes(":")).toBe(false);

    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe("new-token-value");
  });
});
