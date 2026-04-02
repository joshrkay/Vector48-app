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

    // Find existing conversation for this contact (locationId comes from opts)
    const convListResult = await getConversations({ contactId: body.contactId }, opts);
    const existingConvs = convListResult.conversations ?? [];

    let conversationId: string;
    if (existingConvs.length > 0) {
      conversationId = existingConvs[0].id;
    } else {
      // No existing conversation — create one (GHL ties it to the contact automatically)
      const createResult = await createConversation(
        { contactId: body.contactId, locationId },
        opts,
      );
      conversationId = createResult.conversation.id;
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

    return NextResponse.json({ ok: true, messageId: msg.id });
  } catch (err) {
    console.error("[execution/send-sms]", err);
    return NextResponse.json({ error: "Failed to send SMS" }, { status: 502 });
  }
}
