import { type NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { withAuthRetry } from "@/lib/ghl";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { body: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.body?.trim()) {
    return NextResponse.json({ error: "Note body is required" }, { status: 400 });
  }

  try {
    const note = await withAuthRetry(session.accountId, async (client) => {
      return client.rawRequest<{ note: unknown }>("POST", `/contacts/${id}/notes`, {
        body: { body: body.body.trim() },
      });
    });
    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error("[ghl-contact-note-add]", error);
    return NextResponse.json({ error: "Failed to add note" }, { status: 502 });
  }
}
