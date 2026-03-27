// ---------------------------------------------------------------------------
// GoHighLevel — Token Retrieval, Encryption & Client Factory (server-only)
// ---------------------------------------------------------------------------

import "server-only";

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

import { GHLClient } from "./client";
import { GHLAuthError } from "./errors";
import type { Database } from "@/lib/supabase/types";

// ── Encryption config ──────────────────────────────────────────────────────

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const SEPARATOR = ":";

function getEncryptionKey(): Buffer {
  const raw = process.env.GHL_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "GHL_TOKEN_ENCRYPTION_KEY is required. Must be a 32-byte key, base64-encoded.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `GHL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}).`,
    );
  }
  return key;
}

// ── Encrypt / Decrypt ──────────────────────────────────────────────────────

/**
 * Encrypt a plaintext token using AES-256-GCM.
 * Output format: base64(iv):base64(ciphertext):base64(authTag)
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    encrypted.toString("base64"),
    tag.toString("base64"),
  ].join(SEPARATOR);
}

/**
 * Decrypt an encrypted token string produced by `encryptToken`.
 */
export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(SEPARATOR);
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format");
  }

  const iv = Buffer.from(parts[0], "base64");
  const ciphertext = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("Invalid encrypted token format");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

// ── Supabase admin client ──────────────────────────────────────────────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false },
  });
}

// ── Client factories ───────────────────────────────────────────────────────

/**
 * Fetch the encrypted GHL token for an account, decrypt it,
 * and return an initialized GHLClient scoped to that location.
 */
export async function getGHLClient(accountId: string): Promise<GHLClient> {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("accounts")
    .select("ghl_token_encrypted, ghl_location_id")
    .eq("id", accountId)
    .single();

  if (error || !data) {
    throw new GHLAuthError(`Account not found: ${accountId}`);
  }

  if (!data.ghl_token_encrypted || !data.ghl_location_id) {
    throw new GHLAuthError(
      `GHL credentials not configured for account ${accountId}`,
    );
  }

  const token = decryptToken(data.ghl_token_encrypted);

  return new GHLClient({
    locationId: data.ghl_location_id,
    token,
  });
}

/**
 * Return an agency-level GHLClient using the GHL_API_KEY env var.
 * Used for sub-account creation and webhook management.
 */
export function getAgencyClient(): GHLClient {
  const apiKey = process.env.GHL_API_KEY ?? process.env.GHL_AGENCY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GHL_API_KEY or GHL_AGENCY_API_KEY env var is required for agency operations",
    );
  }
  return new GHLClient({ agencyApiKey: apiKey });
}
