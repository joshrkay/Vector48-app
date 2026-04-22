import { NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { cachedGHLClient } from "@/lib/ghl/cache";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(session.accountId);
    const { campaigns } = await cachedGHLClient(session.accountId).getCampaigns({
      locationId,
      apiKey: accessToken,
    });
    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error("[ghl-campaigns-list]", error);
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 502 });
  }
}
