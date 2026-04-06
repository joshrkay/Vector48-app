import { NextRequest, NextResponse } from "next/server";

import { requireAccountForUser } from "@/lib/auth/account";
import { invalidateGHLCache } from "@/lib/ghl/cacheInvalidation";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { addContactNote } from "@/lib/ghl/contacts";
import { createOpportunity } from "@/lib/ghl/opportunities";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        contactId?: string;
        pipelineId?: string;
        pipelineStageId?: string;
        jobType?: string;
        monetaryValue?: number | string | null;
        notes?: string;
      }
    | null;

  if (
    !body?.contactId?.trim() ||
    !body.pipelineId?.trim() ||
    !body.pipelineStageId?.trim() ||
    !body.jobType?.trim()
  ) {
    return NextResponse.json(
      {
        error: "contactId, pipelineId, pipelineStageId, and jobType are required",
      },
      { status: 400 },
    );
  }

  const parsedValue =
    body.monetaryValue === null || body.monetaryValue === undefined || body.monetaryValue === ""
      ? undefined
      : Number(body.monetaryValue);

  if (parsedValue !== undefined && Number.isNaN(parsedValue)) {
    return NextResponse.json({ error: "monetaryValue must be numeric" }, { status: 400 });
  }

  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(session.accountId);
    const result = await createOpportunity(
      {
        locationId,
        contactId: body.contactId.trim(),
        pipelineId: body.pipelineId.trim(),
        pipelineStageId: body.pipelineStageId.trim(),
        name: body.jobType.trim(),
        ...(parsedValue !== undefined ? { monetaryValue: parsedValue } : {}),
      },
      { locationId, apiKey: accessToken },
    );

    if (body.notes?.trim()) {
      void addContactNote(
        body.contactId.trim(),
        body.notes.trim(),
        { locationId, apiKey: accessToken },
      ).catch((error) => {
        console.error("[ghl-opportunity-create-note]", error);
      });
    }

    invalidateGHLCache(session.accountId, "OpportunityCreate", {
      invalidateInMemoryFallback: true,
    });

    return NextResponse.json({ opportunity: result }, { status: 201 });
  } catch (error) {
    console.error("[ghl-opportunity-create]", error);
    return NextResponse.json({ error: "Failed to create opportunity" }, { status: 502 });
  }
}
