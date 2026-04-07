import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken, decryptToken } from "./token";
import type { GHLOAuthTokenResponse } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GHL_TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";

/** Refresh proactively when the token expires within this window. */
const REFRESH_BUFFER_MS = 5 * 60_000; // 5 minutes

// ---------------------------------------------------------------------------
// Mutex — prevents concurrent refresh races
// ---------------------------------------------------------------------------

const refreshLocks = new Map<string, Promise<string>>();

function withLock(key: string, fn: () => Promise<string>): Promise<string> {
  const existing = refreshLocks.get(key);
  if (existing) return existing;

  const promise = fn().finally(() => {
    refreshLocks.delete(key);
  });
  refreshLocks.set(key, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GHL_CLIENT_ID;
  const clientSecret = process.env.GHL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GHL_CLIENT_ID and GHL_CLIENT_SECRET must be configured");
  }
  return { clientId, clientSecret };
}

function getRedirectUri(): string {
  return (
    process.env.GHL_OAUTH_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/integrations/ghl/callback`
  );
}

async function postToken(
  body: Record<string, string>,
): Promise<GHLOAuthTokenResponse> {
  const res = await fetch(GHL_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    console.error("[ghl/oauth] token request failed", res.status, json);
    throw new Error(
      `GHL token request failed (${res.status}): ${json.error_description ?? json.error ?? "unknown"}`,
    );
  }

  return json as unknown as GHLOAuthTokenResponse;
}

// ---------------------------------------------------------------------------
// Authorization Code Exchange
// ---------------------------------------------------------------------------

/**
 * Exchange an authorization code obtained from the GHL OAuth consent screen
 * for an access + refresh token pair.
 */
export async function exchangeCodeForTokens(
  code: string,
  userType: "Company" | "Location" = "Company",
): Promise<GHLOAuthTokenResponse> {
  const { clientId, clientSecret } = getClientCredentials();
  return postToken({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    user_type: userType,
    redirect_uri: getRedirectUri(),
  });
}

// ---------------------------------------------------------------------------
// Agency Token Management
// ---------------------------------------------------------------------------

/**
 * Returns a valid agency-level access token.
 *
 * 1. Checks the `ghl_agency_oauth` table for an existing token pair.
 * 2. Refreshes if within the buffer window.
 * 3. Falls back to the static `GHL_AGENCY_API_KEY` env var if no OAuth row exists.
 */
export async function getAgencyAccessToken(): Promise<string> {
  return withLock("__agency__", async () => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("ghl_agency_oauth" as never)
      .select("id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const row = data as {
      id: string;
      access_token_encrypted: string;
      refresh_token_encrypted: string;
      token_expires_at: string;
    } | null;

    if (!row) {
      // Fallback: static agency API key (backward compat)
      const legacyKey = process.env.GHL_AGENCY_API_KEY;
      if (!legacyKey) {
        throw new Error(
          "No GHL agency OAuth credentials found and GHL_AGENCY_API_KEY is not set",
        );
      }
      return legacyKey;
    }

    const expiresAt = new Date(row.token_expires_at).getTime();
    if (expiresAt - Date.now() > REFRESH_BUFFER_MS) {
      return decryptToken(row.access_token_encrypted);
    }

    // Token is near expiry — refresh it
    const refreshToken = decryptToken(row.refresh_token_encrypted);
    const tokens = await refreshTokenPair(refreshToken, "Company");

    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + tokens.expires_in * 1000);

    await admin
      .from("ghl_agency_oauth" as never)
      .update({
        access_token_encrypted: encryptToken(tokens.access_token),
        refresh_token_encrypted: encryptToken(tokens.refresh_token),
        token_expires_at: newExpiresAt.toISOString(),
        updated_at: now.toISOString(),
      } as never)
      .eq("id" as never, row.id as never);

    return tokens.access_token;
  });
}

/**
 * Read the agency companyId from the `ghl_agency_oauth` table,
 * falling back to `GHL_AGENCY_ID` / `GHL_AGENCY_COMPANY_ID` env vars.
 */
export async function getAgencyCompanyId(): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("ghl_agency_oauth" as never)
    .select("company_id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as { company_id: string } | null;
  if (row?.company_id) return row.company_id;

  const envId = process.env.GHL_AGENCY_ID ?? process.env.GHL_AGENCY_COMPANY_ID;
  if (envId) return envId;

  throw new Error(
    "GHL agency companyId not found — complete the GHL OAuth install or set GHL_AGENCY_ID",
  );
}

// ---------------------------------------------------------------------------
// Location Token Refresh
// ---------------------------------------------------------------------------

/**
 * Refresh a per-location token. Updates the DB with the new token pair.
 * Returns the new access token.
 */
export async function refreshLocationToken(accountId: string): Promise<string> {
  return withLock(`location:${accountId}`, async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("accounts")
      .select("ghl_refresh_token_encrypted, ghl_token_encrypted")
      .eq("id", accountId)
      .maybeSingle();

    if (error || !data?.ghl_refresh_token_encrypted) {
      throw new Error(
        `No GHL refresh token for account ${accountId} — cannot refresh`,
      );
    }

    const refreshToken = decryptToken(data.ghl_refresh_token_encrypted);
    const tokens = await refreshTokenPair(refreshToken, "Location");

    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + tokens.expires_in * 1000);

    await admin
      .from("accounts")
      .update({
        ghl_token_encrypted: encryptToken(tokens.access_token),
        ghl_refresh_token_encrypted: encryptToken(tokens.refresh_token),
        ghl_token_expires_at: newExpiresAt.toISOString(),
      })
      .eq("id", accountId);

    return tokens.access_token;
  });
}

// ---------------------------------------------------------------------------
// Shared refresh helper
// ---------------------------------------------------------------------------

async function refreshTokenPair(
  refreshToken: string,
  userType: "Company" | "Location",
): Promise<GHLOAuthTokenResponse> {
  const { clientId, clientSecret } = getClientCredentials();
  return postToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    user_type: userType,
    redirect_uri: getRedirectUri(),
  });
}

// ---------------------------------------------------------------------------
// Upsert agency OAuth row (called from the OAuth callback)
// ---------------------------------------------------------------------------

export async function upsertAgencyOAuth(tokens: GHLOAuthTokenResponse) {
  const admin = createAdminClient();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + tokens.expires_in * 1000);

  const row = {
    company_id: tokens.companyId,
    access_token_encrypted: encryptToken(tokens.access_token),
    refresh_token_encrypted: encryptToken(tokens.refresh_token),
    token_expires_at: expiresAt.toISOString(),
    scopes: tokens.scope ?? null,
    updated_at: now.toISOString(),
  };

  // Check for existing row
  const { data: existing } = await admin
    .from("ghl_agency_oauth" as never)
    .select("id")
    .limit(1)
    .maybeSingle();

  const existingRow = existing as { id: string } | null;

  if (existingRow) {
    await admin
      .from("ghl_agency_oauth" as never)
      .update(row as never)
      .eq("id" as never, existingRow.id as never);
  } else {
    await admin.from("ghl_agency_oauth" as never).insert(row as never);
  }
}
