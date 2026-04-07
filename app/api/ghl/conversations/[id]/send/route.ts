import { type NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { withAuthRetry } from "@/lib/ghl";
import { createServerClient } from "@/lib/supabase/server";
import type { GHLMessageType } from "@/lib/ghl/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;

  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { type: GHLMessageType; message: string; contactId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.message?.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }
  if (!body.contactId) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }

  try {
    const message = await withAuthRetry(session.accountId, async (client) => {
      return client.conversations.sendMessage(conversationId, {
        type: body.type ?? "TYPE_SMS",
        message: body.message.trim(),
        contactId: body.contactId,
        conversationId,
      });
    });
    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error("[ghl-conversation-send]", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 502 });
  }
}
