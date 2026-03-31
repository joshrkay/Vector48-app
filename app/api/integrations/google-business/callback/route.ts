import { NextResponse } from "next/server";
import { parseOAuthState } from "@/lib/settings/oauthState";
import { getAppUrl } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { encryptCredentials } from "@/lib/integrations/credentialStore";

function redirectWithError(code: string) {
  return NextResponse.redirect(
    new URL(
      `/settings?tab=integrations&error=${encodeURIComponent(code)}`,
      getAppUrl(),
    ),
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthErr = url.searchParams.get("error");

  if (oauthErr) {
    return redirectWithError(oauthErr);
  }
  if (!code || !state) {
    return redirectWithError("missing_code_or_state");
  }

  let payload;
  try {
    payload = parseOAuthState(state);
  } catch {
    return redirectWithError("invalid_state");
  }

  const redirectUri = `${getAppUrl()}/api/integrations/google-business/callback`;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirectWithError("google_oauth_not_configured");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  const tokenJson = (await tokenRes.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!tokenRes.ok) {
    console.error("[google callback] token exchange", tokenRes.status, tokenJson);
    return redirectWithError("token_exchange_failed");
  }

  const admin = getSupabaseAdmin();
  const { data: acc } = await admin
    .from("accounts")
    .select("id")
    .eq("id", payload.accountId)
    .maybeSingle();

  if (!acc) {
    return redirectWithError("account_not_found");
  }

  const creds = encryptCredentials({
    access_token: tokenJson.access_token,
    refresh_token: tokenJson.refresh_token,
    token_type: tokenJson.token_type,
    expires_in: tokenJson.expires_in,
    scope: tokenJson.scope,
  });
  const now = new Date().toISOString();

  const { data: row } = await admin
    .from("integrations")
    .select("id")
    .eq("account_id", payload.accountId)
    .eq("provider", "google_business")
    .maybeSingle();

  if (row) {
    const { error: updateErr } = await admin
      .from("integrations")
      .update({
        status: "connected",
        credentials_encrypted: creds as unknown as Record<string, unknown>,
        connected_at: now,
      })
      .eq("id", row.id);
    if (updateErr) {
      console.error("[google-business callback] integration update", updateErr.message);
      return redirectWithError("integration_save_failed");
    }
  } else {
    const { error: insertErr } = await admin.from("integrations").insert({
      account_id: payload.accountId,
      provider: "google_business",
      status: "connected",
      credentials_encrypted: creds as unknown as Record<string, unknown>,
      connected_at: now,
    });
    if (insertErr) {
      console.error("[google-business callback] integration insert", insertErr.message);
      return redirectWithError("integration_save_failed");
    }
  }

  return NextResponse.redirect(
    new URL("/settings?tab=integrations", getAppUrl()),
  );
}
