import { NextRequest, NextResponse } from "next/server";

import { requireAccountForUser } from "@/lib/auth/account";
import { invalidateGHLCache } from "@/lib/ghl/cacheInvalidation";
import { withAuthRetry } from "@/lib/ghl";
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
    const result = await withAuthRetry(session.accountId, async (client) => {
      const opportunity = await client.opportunities.create({
        contactId: body.contactId!.trim(),
        pipelineId: body.pipelineId!.trim(),
        pipelineStageId: body.pipelineStageId!.trim(),
        name: body.jobType!.trim(),
        ...(parsedValue !== undefined ? { monetaryValue: parsedValue } : {}),
      });

      if (body.notes?.trim()) {
        void client.rawRequest("POST", `/contacts/${body.contactId!.trim()}/notes`, {
          body: { body: body.notes!.trim() },
        }).catch((error) => {
          console.error("[ghl-opportunity-create-note]", error);
        });
      }

      return opportunity;
    });

    invalidateGHLCache(session.accountId, "OpportunityCreate", {
      invalidateInMemoryFallback: true,
    });

    return NextResponse.json({ opportunity: result }, { status: 201 });
  } catch (error) {
    console.error("[ghl-opportunity-create]", error);
    return NextResponse.json({ error: "Failed to create opportunity" }, { status: 502 });
  }
}
