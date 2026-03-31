// ---------------------------------------------------------------------------
// GHL token AES-256-GCM helpers (Node). Imported by server-only `token.ts`
// and by unit tests — no `server-only` guard here.
// ---------------------------------------------------------------------------
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Encrypt a token with AES-256-GCM for storage on accounts.ghl_token_encrypted.
 * Format: base64(iv + ciphertext + authTag) — matches decryptToken.
 */
export function encryptGhlToken(plain: string): string {
  const key = process.env.GHL_TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("GHL_TOKEN_ENCRYPTION_KEY is not configured");
  }

  const keyBuffer = Buffer.from(key, "hex");
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, ciphertext, tag]).toString("base64");
}

/**
 * Decrypt a token that was encrypted with AES-256-GCM.
 * Expected format: base64(iv + ciphertext + authTag)
 */
export function decryptToken(encrypted: string): string {
  const key = process.env.GHL_TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("GHL_TOKEN_ENCRYPTION_KEY is not configured");
  }

  const keyBuffer = Buffer.from(key, "hex");
  const data = Buffer.from(encrypted, "base64");

  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(data.length - TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH, data.length - TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/** @deprecated Prefer `encryptGhlToken` — alias for tests and legacy call sites. */
export const encryptToken = encryptGhlToken;
