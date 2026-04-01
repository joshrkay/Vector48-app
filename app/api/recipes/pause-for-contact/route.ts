import { type NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { getContact } from "@/lib/ghl/contacts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { contactId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.contactId?.trim()) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }

  const contactId = body.contactId.trim();
  const admin = getSupabaseAdmin();

  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(session.accountId);
    const { contact } = await getContact(contactId, { locationId, apiKey: accessToken });

    const { data: triggersBefore, error: selectError } = await admin
      .from("recipe_triggers")
      .select("id, recipe_slug")
      .eq("account_id", session.accountId)
      .eq("contact_id", contactId)
      .eq("fired", false);

    if (selectError) {
      console.error("[pause-for-contact] select triggers", selectError.message);
      return NextResponse.json({ error: "Failed to read scheduled steps" }, { status: 502 });
    }

    const { error: delError } = await admin
      .from("recipe_triggers")
      .delete()
      .eq("account_id", session.accountId)
      .eq("contact_id", contactId)
      .eq("fired", false);

    if (delError) {
      console.error("[pause-for-contact] delete triggers", delError.message);
      return NextResponse.json({ error: "Failed to pause sequence" }, { status: 502 });
    }

    const removed = triggersBefore?.length ?? 0;
    const primarySlug = triggersBefore?.[0]?.recipe_slug ?? null;

    const fromParts = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
    const contactName = contact.name?.trim() || fromParts || null;

    await admin.from("automation_events").insert({
      account_id: session.accountId,
      recipe_slug: primarySlug,
      event_type: "sequence_paused",
      ghl_event_type: null,
      ghl_event_id: `inbox-manual-reply:${contactId}:${Date.now()}`,
      contact_id: contactId,
      contact_phone: contact.phone,
      contact_name: contactName,
      summary: `Follow-up sequence cleared for ${contactName ?? contact.phone ?? "contact"} after manual inbox reply`,
      detail: {
        reason: "human_reply_inbox",
        triggers_removed: removed,
        recipe_slugs: (triggersBefore ?? []).map((t) => t.recipe_slug),
      },
    });

    return NextResponse.json({ ok: true, triggersRemoved: removed });
  } catch (error) {
    console.error("[pause-for-contact]", error);
    return NextResponse.json({ error: "Failed to pause for contact" }, { status: 502 });
  }
}
