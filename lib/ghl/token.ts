// ---------------------------------------------------------------------------
// GoHighLevel — Token Decryption & Client Factory
// Server-only: never import this file in client components.
// ---------------------------------------------------------------------------
import "server-only";

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import type { Database } from "@/lib/supabase/types";
import { GHLClient } from "./client";

// ── AES-256-GCM decryption ─────────────────────────────────────────────────

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Decrypt a token that was encrypted with AES-256-GCM.
 * Expected format: base64(iv + ciphertext + authTag)
 */
function decryptToken(encrypted: string): string {
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

// ── Supabase admin client (service role, bypasses RLS) ──────────────────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase URL or service role key is not configured");
  }
  return createClient<Database>(url, serviceKey);
}

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Fetch the GHL token for an account, decrypt it, and return an initialized
 * GHLClient scoped to that account's location.
 *
 * This is the primary way application code should obtain a GHL client.
 */
export async function getGHLClient(accountId: string): Promise<GHLClient> {
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
    throw new Error(
      `Account ${accountId} is not connected to GoHighLevel`,
    );
  }

  const token = decryptToken(account.ghl_token_encrypted);
  return GHLClient.forLocation(account.ghl_location_id, token);
}

/**
 * Decrypted GHL access token and location id for server-side integrations (e.g. n8n credentials).
 * Does not log token material.
 */
export async function getAccountGhlCredentials(accountId: string): Promise<{
  locationId: string;
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
    accessToken,
  };
}
