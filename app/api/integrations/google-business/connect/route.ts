import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { createOAuthState } from "@/lib/settings/oauthState";
import { getAppUrl } from "@/lib/env";

export async function GET() {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.redirect(new URL("/login", getAppUrl()));
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "GOOGLE_OAUTH_CLIENT_ID is not configured" },
      { status: 503 },
    );
  }

  const redirectUri = `${getAppUrl()}/api/integrations/google-business/callback`;
  const state = createOAuthState(session.accountId);
  const scope =
    process.env.GOOGLE_BUSINESS_SCOPE ??
    "https://www.googleapis.com/auth/business.manage";

  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  u.searchParams.set("scope", scope);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");

  return NextResponse.redirect(u.toString());
}
