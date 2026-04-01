import { type NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { getMessages } from "@/lib/ghl/conversations";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { createServerClient } from "@/lib/supabase/server";
import type { GHLMessageType } from "@/lib/ghl/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;

  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get("limit");
  const lastMessageId = searchParams.get("lastMessageId") ?? undefined;
  const type = searchParams.get("type") as GHLMessageType | undefined;
  const limit = limitRaw ? Math.min(Math.max(Number(limitRaw), 1), 100) : 50;

  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(session.accountId);
    const result = await getMessages(
      {
        conversationId,
        limit,
        lastMessageId,
        ...(type ? { type } : {}),
      },
      { locationId, apiKey: accessToken },
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("[ghl-conversation-messages-get]", error);
    return NextResponse.json({ error: "Failed to load messages" }, { status: 502 });
  }
}
