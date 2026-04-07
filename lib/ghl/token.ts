import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { GHLClient } from "./client";
import { GHLApiError, GHLAuthError } from "./errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgencyAccessToken, refreshLocationToken } from "./oauth";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_STALE_MS = 15 * 60_000;

type CachedCredential = {
  locationId: string;
  token: string;
  expiresAt: number;
  lastAccess: number;
};

const credentialCache = new Map<string, CachedCredential>();

function getEncryptionKey(): Buffer {
  const raw =
    process.env.ENCRYPTION_KEY ?? process.env.GHL_TOKEN_ENCRYPTION_KEY ?? "";

  if (!raw) {
    throw new Error("ENCRYPTION_KEY or GHL_TOKEN_ENCRYPTION_KEY is not configured");
  }

  const trimmed = raw.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");

  if (key.length !== 32) {
    throw new Error("GHL encryption key must decode to 32 bytes");
  }

  return key;
}

function readCache(accountId: string): CachedCredential | null {
  const cached = credentialCache.get(accountId);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    credentialCache.delete(accountId);
    return null;
  }

  cached.lastAccess = Date.now();
  return cached;
}

function writeCache(accountId: string, value: Omit<CachedCredential, "expiresAt" | "lastAccess">) {
  credentialCache.set(accountId, {
    ...value,
    expiresAt: Date.now() + CACHE_TTL_MS,
    lastAccess: Date.now(),
  });

  if (credentialCache.size > 250) {
    const cutoff = Date.now() - CACHE_STALE_MS;
    for (const [key, entry] of Array.from(credentialCache.entries())) {
      if (entry.lastAccess < cutoff) {
        credentialCache.delete(key);
      }
    }
  }
}

function decryptWithLayout(
  encrypted: Buffer,
  layout: "iv-ciphertext-tag" | "iv-tag-ciphertext",
): string {
  if (encrypted.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted token payload");
  }

  const iv = encrypted.subarray(0, IV_LENGTH);
  const authTag =
    layout === "iv-ciphertext-tag"
      ? encrypted.subarray(encrypted.length - AUTH_TAG_LENGTH)
      : encrypted.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext =
    layout === "iv-ciphertext-tag"
      ? encrypted.subarray(IV_LENGTH, encrypted.length - AUTH_TAG_LENGTH)
      : encrypted.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptToken(token: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Preserve the legacy token layout already used in this repo:
  // base64(iv + ciphertext + authTag)
  return Buffer.concat([iv, ciphertext, authTag]).toString("base64");
}

export function decryptToken(encryptedToken: string): string {
  const payload = Buffer.from(encryptedToken, "base64");
  const attempts: Array<"iv-ciphertext-tag" | "iv-tag-ciphertext"> = [
    "iv-ciphertext-tag",
    "iv-tag-ciphertext",
  ];

  let lastError: unknown;
  for (const layout of attempts) {
    try {
      return decryptWithLayout(payload, layout);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to decrypt GHL token");
}

async function loadCredentials(accountId: string): Promise<{
  locationId: string;
  token: string;
} | null> {
  const cached = readCache(accountId);
  if (cached) {
    return { locationId: cached.locationId, token: cached.token };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("accounts")
    .select(
      "ghl_location_id, ghl_token_encrypted, ghl_refresh_token_encrypted, ghl_token_expires_at",
    )
    .eq("id", accountId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`GHL account credentials not found for account ${accountId}`);
  }

  if (!data.ghl_location_id || !data.ghl_token_encrypted) {
    // Account exists but hasn't connected GHL yet — return null instead of throwing
    return null;
  }

  let token: string;

  // If we have a refresh token and the access token is expired or near expiry, refresh it.
  // Also refresh when expiry is unknown (NULL) — the token may be stale from
  // agency-key provisioning that didn't record an expiry timestamp.
  const hasRefresh = !!data.ghl_refresh_token_encrypted;
  const expiresAt = data.ghl_token_expires_at
    ? new Date(data.ghl_token_expires_at).getTime()
    : null;
  const isNearExpiry = expiresAt !== null && expiresAt - Date.now() < 5 * 60_000;
  const expiryUnknown = expiresAt === null;

  if (hasRefresh && (isNearExpiry || expiryUnknown)) {
    try {
      token = await refreshLocationToken(accountId);
    } catch (refreshErr) {
      // If refresh fails, fall back to the existing token — it may still work.
      console.warn(
        JSON.stringify({
          level: "warn",
          service: "ghl",
          event: "token_refresh_fallback",
          accountId,
          message: refreshErr instanceof Error ? refreshErr.message : String(refreshErr),
        }),
      );
      token = decryptToken(data.ghl_token_encrypted);
    }
  } else {
    token = decryptToken(data.ghl_token_encrypted);
  }

  writeCache(accountId, {
    locationId: data.ghl_location_id,
    token,
  });

  return { locationId: data.ghl_location_id, token };
}

/**
 * Evict cached credentials for an account. Called by the GHL client
 * after a 401 so the next loadCredentials() call forces a DB read
 * (and potentially a token refresh).
 */
export function invalidateCredentialCache(accountId: string): void {
  credentialCache.delete(accountId);
}

export async function getDecryptedToken(accountId: string): Promise<string> {
  const credentials = await loadCredentials(accountId);
  if (!credentials) {
    throw new Error(`Account ${accountId} is not connected to GoHighLevel`);
  }
  return credentials.token;
}

export async function getAccountGhlCredentials(accountId: string): Promise<{
  locationId: string;
  token: string;
  accessToken: string;
}> {
  const credentials = await loadCredentials(accountId);
  if (!credentials) {
    throw new Error(`Account ${accountId} is not connected to GoHighLevel`);
  }

  return {
    locationId: credentials.locationId,
    token: credentials.token,
    accessToken: credentials.token,
  };
}

/**
 * Like getAccountGhlCredentials but returns null when the account has no GHL
 * connection yet, instead of throwing. Use this in CRM pages so they render
 * empty rather than crashing for users who haven't set up GoHighLevel.
 */
export async function tryGetAccountGhlCredentials(accountId: string): Promise<{
  locationId: string;
  token: string;
  accessToken: string;
} | null> {
  const credentials = await loadCredentials(accountId);
  if (!credentials) return null;

  return {
    locationId: credentials.locationId,
    token: credentials.token,
    accessToken: credentials.token,
  };
}

export async function getGHLClient(accountId: string): Promise<GHLClient> {
  const credentials = await loadCredentials(accountId);
  if (!credentials) {
    throw new Error(`Account ${accountId} is not connected to GoHighLevel`);
  }
  return GHLClient.forLocation(credentials.locationId, credentials.token);
}

export async function getAgencyClient(): Promise<GHLClient> {
  const token = await getAgencyAccessToken();
  return GHLClient.forAgency(token);
}

/**
 * Run a GHL operation with automatic 401 retry.
 *
 * On the first 401/403 from the GHL API, the credential cache is invalidated
 * and credentials are reloaded (which triggers a token refresh if a refresh
 * token is available). The operation is then retried once with the new token.
 *
 * Usage:
 * ```ts
 * const pipelines = await withAuthRetry(accountId, async (client) => {
 *   return client.pipelines.list();
 * });
 * ```
 */
export async function withAuthRetry<T>(
  accountId: string,
  operation: (client: GHLClient) => Promise<T>,
): Promise<T> {
  const credentials = await loadCredentials(accountId);
  if (!credentials) {
    throw new Error(`Account ${accountId} is not connected to GoHighLevel`);
  }

  const client = GHLClient.forLocation(credentials.locationId, credentials.token);

  try {
    return await operation(client);
  } catch (error) {
    // Only retry on auth errors (401/403)
    const isAuthError =
      error instanceof GHLAuthError ||
      (error instanceof GHLApiError && (error.statusCode === 401 || error.statusCode === 403));

    if (!isAuthError) throw error;

    // Invalidate cache and reload (forces DB read + potential token refresh)
    invalidateCredentialCache(accountId);

    const refreshed = await loadCredentials(accountId);
    if (!refreshed || refreshed.token === credentials.token) {
      // Refresh didn't produce a new token — don't retry with the same one
      throw error;
    }

    console.info(
      JSON.stringify({
        level: "info",
        service: "ghl",
        event: "auth_retry",
        accountId,
        message: "Retrying GHL operation with refreshed token",
      }),
    );

    const retryClient = GHLClient.forLocation(refreshed.locationId, refreshed.token);
    return operation(retryClient);
  }
}
