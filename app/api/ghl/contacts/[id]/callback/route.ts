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

  let body: {
    reason?: string;
    contactName?: string;
    contactPhone?: string;
    idempotencyKey?: string;
  };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const reason = (body.reason ?? "Flagged by operator").trim() || "Flagged by operator";

  // Prefer an explicit client-supplied idempotency key (header or body field)
  // so double-clicks / network retries of the UI button land on the same
  // underlying automation_events row via the unique-index dedup path.
  const idempotencyKey =
    request.headers.get("x-idempotency-key")?.trim() ||
    body.idempotencyKey?.trim() ||
    null;

  try {
    const result = await markCallbackNeeded({
      accountId: session.accountId,
      contactId,
      reason,
      source: "ui_button",
      contactName: body.contactName ?? null,
      contactPhone: body.contactPhone ?? null,
      sourceEventId: idempotencyKey,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[callback-needed-route]", error);
    return NextResponse.json({ error: "Failed to mark callback needed" }, { status: 502 });
  }
}
