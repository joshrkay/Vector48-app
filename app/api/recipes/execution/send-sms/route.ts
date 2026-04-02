import { type NextRequest, NextResponse } from "next/server";
import { validateExecutionAuth } from "@/lib/recipes/executionAuth";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { createConversation, getConversations, sendMessage } from "@/lib/ghl/conversations";

export async function POST(request: NextRequest) {
  let body: {
    accountId: string;
    contactId: string;
    message: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.accountId?.trim()) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }
  if (!body.contactId?.trim()) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }
  if (!body.message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  if (!validateExecutionAuth(request, body.accountId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(body.accountId);
    const opts = { locationId, apiKey: accessToken };

    // Find existing conversation for this contact, or create one
    const convList = await getConversations({ contactId: body.contactId, locationId }, opts);
    const conversations = Array.isArray(convList)
      ? convList
      : (convList as { conversations?: { id: string }[] }).conversations ?? [];

    let conversationId: string;
    if (conversations.length > 0 && conversations[0].id) {
      conversationId = conversations[0].id;
    } else {
      const created = await createConversation({ contactId: body.contactId, locationId }, opts);
      const conv = (created as { conversation?: { id: string } }).conversation ?? (created as { id: string });
      conversationId = conv.id ?? "";
    }

    if (!conversationId) {
      return NextResponse.json({ error: "Could not resolve conversation" }, { status: 502 });
    }

    const msg = await sendMessage(
      conversationId,
      {
        type: "TYPE_SMS",
        contactId: body.contactId,
        message: body.message.trim(),
      },
      opts,
    );

    const msgId =
      typeof (msg as { id?: string }).id === "string"
        ? (msg as { id: string }).id
        : null;

    return NextResponse.json({ ok: true, messageId: msgId });
  } catch (err) {
    console.error("[execution/send-sms]", err);
    return NextResponse.json({ error: "Failed to send SMS" }, { status: 502 });
  }
}
