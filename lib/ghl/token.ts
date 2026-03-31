import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { GHLClient } from "./client";
import { decryptToken } from "./ghlTokenCrypto";

export { decryptToken, encryptGhlToken, encryptToken } from "./ghlTokenCrypto";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Database } from "@/lib/supabase/types";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a plaintext token with AES-256-GCM.
 * Output format: base64(iv + ciphertext + authTag)
 */
export function encryptToken(plaintext: string): string {
  const key = process.env.GHL_TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("GHL_TOKEN_ENCRYPTION_KEY is not configured");
  }

  const keyBuffer = Buffer.from(key, "hex");
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, encrypted, tag]).toString("base64");
}

/**
 * Decrypt a token that was encrypted with AES-256-GCM.
 * Expected format: base64(iv + ciphertext + authTag)
 */
function decryptToken(encrypted: string): string {
  const key = process.env.GHL_TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("GHL_TOKEN_ENCRYPTION_KEY is not configured");
  }

  const data = Buffer.from(encrypted, "base64");
  if (data.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted token payload.");
  }

  return {
    iv: data.subarray(0, IV_LENGTH),
    ciphertext: data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH),
    authTag: data.subarray(data.length - AUTH_TAG_LENGTH),
  };
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Canonical format: base64(iv + ciphertext + authTag).
  return Buffer.concat([iv, ciphertext, authTag]).toString("base64");
}

export function decryptToken(encrypted: string): string {
  const key = getKey();
  const parts = parseEncryptedToken(encrypted);

  const decipher = createDecipheriv(ALGORITHM, key, parts.iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(parts.authTag);

  const decrypted = Buffer.concat([
    decipher.update(parts.ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase URL or service role key is not configured");
  }
  return createClient<Database>(url, serviceKey);
}

/**
 * Fetch and decrypt GHL credentials for an account.
 * Returns both `token` and `accessToken` (same value) for backward compatibility.
 * Does not log token material.
 */
export async function getAccountGhlCredentials(accountId: string): Promise<{
  locationId: string;
  token: string;
  accessToken: string;
}> {
  const supabase = getAdminClient();

  const { data: account, error } = await supabase
    .from("accounts")
    .select("ghl_location_id, ghl_token_encrypted")
    .eq("id", accountId)
    .single();

  if (error || !account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  if (!account.ghl_token_encrypted || !account.ghl_location_id) {
    throw new Error(`Account ${accountId} is not connected to GoHighLevel`);
  }

  const accessToken = decryptToken(account.ghl_token_encrypted);
  return {
    locationId: account.ghl_location_id,
    token: accessToken,
    accessToken,
  };
}

export async function getGHLClient(accountId: string): Promise<{
  locationId: string;
  token: string;
}> {
  return getAccountGhlCredentials(accountId);
}
