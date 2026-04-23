import { type NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { markCallbackNeeded } from "@/lib/recipes/callback";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: contactId } = await params;

  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { reason?: string; contactName?: string; contactPhone?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const reason = (body.reason ?? "Flagged by operator").trim() || "Flagged by operator";

  try {
    const result = await markCallbackNeeded({
      accountId: session.accountId,
      contactId,
      reason,
      source: "ui_button",
      contactName: body.contactName ?? null,
      contactPhone: body.contactPhone ?? null,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[callback-needed-route]", error);
    return NextResponse.json({ error: "Failed to mark callback needed" }, { status: 502 });
  }
}
