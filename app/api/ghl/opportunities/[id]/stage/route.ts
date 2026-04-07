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
    | { pipelineStageId?: string }
    | null;

  if (!body?.pipelineStageId?.trim()) {
    return NextResponse.json({ error: "pipelineStageId is required" }, { status: 400 });
  }

  try {
    const opportunity = await withAuthRetry(session.accountId, async (client) => {
      return client.opportunities.updateStage(id, body.pipelineStageId!.trim());
    });

    invalidateGHLCache(session.accountId, "OpportunityStageUpdate", {
      invalidateInMemoryFallback: true,
    });

    return NextResponse.json({ opportunity });
  } catch (error) {
    console.error("[ghl-opportunity-stage-update]", error);
    return NextResponse.json({ error: "Failed to update opportunity stage" }, { status: 502 });
  }
}
