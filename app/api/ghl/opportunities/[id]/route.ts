import { type NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { invalidateGHLCache } from "@/lib/ghl/cacheInvalidation";
import { deleteOpportunity, updateOpportunity } from "@/lib/ghl/opportunities";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { createServerClient } from "@/lib/supabase/server";
import type { GHLUpdateOpportunityPayload } from "@/lib/ghl/types";

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

  let body: GHLUpdateOpportunityPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(session.accountId);
    const result = await updateOpportunity(id, body, { locationId, apiKey: accessToken });

    invalidateGHLCache(session.accountId, "OpportunityStageUpdate", {
      invalidateInMemoryFallback: true,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[ghl-opportunity-update]", error);
    return NextResponse.json({ error: "Failed to update opportunity" }, { status: 502 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(session.accountId);
    await deleteOpportunity(id, { locationId, apiKey: accessToken });

    invalidateGHLCache(session.accountId, "OpportunityStageUpdate", {
      invalidateInMemoryFallback: true,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[ghl-opportunity-delete]", error);
    return NextResponse.json({ error: "Failed to delete opportunity" }, { status: 502 });
  }
}
