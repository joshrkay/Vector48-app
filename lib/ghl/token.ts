// ---------------------------------------------------------------------------
// GHL Token Encryption — AES-256-GCM
// Encrypts/decrypts GHL location API tokens before storing in the database.
// Requires GHL_ENCRYPTION_KEY env var (64-char hex string = 32 bytes).
// ---------------------------------------------------------------------------

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.GHL_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "GHL_ENCRYPTION_KEY is required. Set a 64-character hex string (32 bytes).",
    );
  }
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error(
      `GHL_ENCRYPTION_KEY must be 32 bytes (64 hex chars). Got ${buf.length} bytes.`,
    );
  }
  return buf;
}

/**
 * Encrypts a plaintext token string.
 * Returns a colon-separated string: `iv:authTag:ciphertext` (all base64).
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Decrypts a token previously encrypted with `encryptToken`.
 * Expects the `iv:authTag:ciphertext` format.
 */
export function decryptToken(encrypted: string): string {
  const key = getKey();
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format. Expected iv:authTag:ciphertext.");
  }

  const [ivB64, authTagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
