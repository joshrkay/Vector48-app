import { type NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { getContact } from "@/lib/ghl/contacts";
import { getN8nWebhookUrl } from "@/lib/recipes/eventMapping";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { recipeSlug: string; contactId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.recipeSlug?.trim()) {
    return NextResponse.json({ error: "recipeSlug is required" }, { status: 400 });
  }
  if (!body.contactId?.trim()) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }

  const recipeSlug = body.recipeSlug.trim();
  const contactId = body.contactId.trim();

  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(session.accountId);
    const { contact } = await getContact(contactId, { locationId, apiKey: accessToken });

    const webhookUrl = getN8nWebhookUrl(recipeSlug, session.accountId);

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        contactEmail: contact.email ?? null,
        tags: contact.tags ?? [],
        triggeredBy: "manual",
        accountId: session.accountId,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error("[trigger-manual] n8n webhook responded", res.status, await res.text().catch(() => ""));
      return NextResponse.json({ error: "N8N webhook failed" }, { status: 502 });
    }

    const admin = getSupabaseAdmin();
    const contactName = contact.name?.trim() || null;

    await admin.from("automation_events").insert({
      account_id: session.accountId,
      recipe_slug: recipeSlug,
      event_type: "recipe_triggered_manual",
      ghl_event_type: null,
      ghl_event_id: `manual:${recipeSlug}:${contactId}:${Date.now()}`,
      contact_id: contactId,
      contact_phone: contact.phone ?? null,
      contact_name: contactName,
      summary: `Recipe "${recipeSlug}" manually triggered for ${contactName ?? contact.phone ?? "contact"}`,
      detail: {
        recipe_slug: recipeSlug,
        triggered_by: "manual",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[trigger-manual]", err);
    return NextResponse.json({ error: "Failed to trigger recipe" }, { status: 502 });
  }
}
