import { NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { getConversation } from "@/lib/ghl/conversations";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;

  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(session.accountId);
    const { conversation } = await getConversation(conversationId, {
      locationId,
      apiKey: accessToken,
    });
    return NextResponse.json({ conversation });
  } catch (error) {
    console.error("[ghl-conversation-get]", error);
    return NextResponse.json({ error: "Failed to load conversation" }, { status: 502 });
  }
}
