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

  const clientId = process.env.JOBBER_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "JOBBER_CLIENT_ID is not configured" },
      { status: 503 },
    );
  }

  const redirectUri = `${getAppUrl()}/api/integrations/jobber/callback`;
  const state = createOAuthState(session.accountId);
  const u = new URL(
    process.env.JOBBER_AUTHORIZE_URL ??
      "https://api.getjobber.com/api/oauth/authorize",
  );
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);

  return NextResponse.redirect(u.toString());
}
