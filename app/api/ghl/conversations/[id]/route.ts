import { NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { withAuthRetry } from "@/lib/ghl";
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
    const result = await withAuthRetry(session.accountId, async (client) => {
      return client.conversations.list({ conversationId } as never);
    });
    const conversation = result.data?.[0] ?? null;
    return NextResponse.json({ conversation });
  } catch (error) {
    console.error("[ghl-conversation-get]", error);
    return NextResponse.json({ error: "Failed to load conversation" }, { status: 502 });
  }
}
