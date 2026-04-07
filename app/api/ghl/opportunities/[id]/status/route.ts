import { NextRequest, NextResponse } from "next/server";

import { requireAccountForUser } from "@/lib/auth/account";
import { invalidateGHLCache } from "@/lib/ghl/cacheInvalidation";
import { withAuthRetry } from "@/lib/ghl";
import { createServerClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { status?: "won" | "lost" }
    | null;

  if (body?.status !== "won" && body?.status !== "lost") {
    return NextResponse.json({ error: "status must be 'won' or 'lost'" }, { status: 400 });
  }

  try {
    const opportunity = await withAuthRetry(session.accountId, async (client) => {
      return client.opportunities.updateStatus(id, body.status!);
    });

    invalidateGHLCache(session.accountId, "OpportunityStatusUpdate", {
      invalidateInMemoryFallback: true,
    });

    return NextResponse.json({ opportunity });
  } catch (error) {
    console.error("[ghl-opportunity-status-update]", error);
    return NextResponse.json({ error: "Failed to update opportunity status" }, { status: 502 });
  }
}
