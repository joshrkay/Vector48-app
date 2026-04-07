import { NextResponse } from "next/server";
import { parseOAuthState } from "@/lib/settings/oauthState";
import { getAppUrl } from "@/lib/env";
import { exchangeCodeForTokens, upsertAgencyOAuth } from "@/lib/ghl/oauth";

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

  try {
    parseOAuthState(state);
  } catch {
    return redirectWithError("invalid_state");
  }

  if (!process.env.GHL_CLIENT_ID || !process.env.GHL_CLIENT_SECRET) {
    return redirectWithError("ghl_oauth_not_configured");
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, "Company");
  } catch (err) {
    console.error("[ghl callback] token exchange", err);
    return redirectWithError("token_exchange_failed");
  }

  try {
    await upsertAgencyOAuth(tokens);
  } catch (err) {
    console.error("[ghl callback] save tokens", err);
    return redirectWithError("token_save_failed");
  }

  return NextResponse.redirect(
    new URL("/settings?tab=integrations", getAppUrl()),
  );
}
