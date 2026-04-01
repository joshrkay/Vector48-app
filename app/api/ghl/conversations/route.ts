import { NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { loadEnrichedInboxConversations } from "@/lib/crm/loadEnrichedInboxConversations";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await loadEnrichedInboxConversations(session.accountId);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[ghl-conversations-list]", error);
    return NextResponse.json({ error: "Failed to load conversations" }, { status: 502 });
  }
}
