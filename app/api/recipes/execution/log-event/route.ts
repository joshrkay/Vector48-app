import { type NextRequest, NextResponse } from "next/server";
import { getExecutionAuthConfigError, validateExecutionAuth } from "@/lib/recipes/executionAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const authConfigError = getExecutionAuthConfigError();
  if (authConfigError) {
    return NextResponse.json({ error: authConfigError }, { status: 500 });
  }

  let body: {
    accountId: string;
    recipeSlug?: string;
    eventType: string;
    contactId?: string;
    contactPhone?: string;
    contactName?: string;
    summary: string;
    detail?: Record<string, unknown>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.accountId?.trim()) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }
  if (!body.eventType?.trim()) {
    return NextResponse.json({ error: "eventType is required" }, { status: 400 });
  }
  if (!body.summary?.trim()) {
    return NextResponse.json({ error: "summary is required" }, { status: 400 });
  }

  if (!validateExecutionAuth(request, body.accountId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("automation_events")
      .insert({
        account_id: body.accountId,
        recipe_slug: body.recipeSlug ?? null,
        event_type: body.eventType,
        ghl_event_type: null,
        ghl_event_id: `n8n:${body.accountId}:${body.eventType}:${Date.now()}`,
        contact_id: body.contactId ?? null,
        contact_phone: body.contactPhone ?? null,
        contact_name: body.contactName ?? null,
        summary: body.summary,
        detail: body.detail ?? {},
      })
      .select("id")
      .single();

    if (error) {
      console.error("[execution/log-event]", error.message);
      return NextResponse.json({ error: "Failed to log event" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error("[execution/log-event]", err);
    return NextResponse.json({ error: "Failed to log event" }, { status: 502 });
  }
}
