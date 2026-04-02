import { type NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
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
    // Load all active activations that have this contact in paused_contact_ids
    const { data: activations, error: selectError } = await admin
      .from("recipe_activations")
      .select("id, recipe_slug, config")
      .eq("account_id", session.accountId)
      .eq("status", "active");

    if (selectError) {
      console.error("[resume-for-contact] select activations", selectError.message);
      return NextResponse.json({ error: "Failed to read activations" }, { status: 502 });
    }

    const toResume = (activations ?? []).filter((activation) => {
      const cfg = (activation.config ?? {}) as Record<string, unknown>;
      const pausedIds = Array.isArray(cfg.paused_contact_ids) ? cfg.paused_contact_ids : [];
      return pausedIds.includes(contactId);
    });

    if (toResume.length === 0) {
      return NextResponse.json({ ok: true, resumedCount: 0 });
    }

    const resumedSlugs: string[] = [];

    for (const activation of toResume) {
      const cfg = (activation.config ?? {}) as Record<string, unknown>;
      const pausedIds = Array.isArray(cfg.paused_contact_ids)
        ? (cfg.paused_contact_ids as string[]).filter((id) => id !== contactId)
        : [];

      const { error: updateError } = await admin
        .from("recipe_activations")
        .update({ config: { ...cfg, paused_contact_ids: pausedIds } })
        .eq("id", activation.id);

      if (updateError) {
        console.error("[resume-for-contact] update config", updateError.message);
        continue;
      }

      resumedSlugs.push(activation.recipe_slug);

      // Best-effort: notify N8N resume webhook
      if (typeof cfg.resume_webhook_url === "string" && cfg.resume_webhook_url) {
        fetch(cfg.resume_webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId }),
          signal: AbortSignal.timeout(5000),
        }).catch((err) => console.error("[resume-for-contact] n8n resume webhook failed", err));
      }
    }

    if (resumedSlugs.length > 0) {
      await admin.from("automation_events").insert({
        account_id: session.accountId,
        recipe_slug: resumedSlugs[0] ?? null,
        event_type: "sequence_resumed",
        ghl_event_type: null,
        ghl_event_id: `inbox-resume:${contactId}:${Date.now()}`,
        contact_id: contactId,
        contact_phone: null,
        contact_name: null,
        summary: `Follow-up sequence resumed for contact after human conversation ended`,
        detail: {
          reason: "manual_resume",
          recipe_slugs: resumedSlugs,
        },
      });
    }

    return NextResponse.json({ ok: true, resumedCount: resumedSlugs.length });
  } catch (err) {
    console.error("[resume-for-contact]", err);
    return NextResponse.json({ error: "Failed to resume for contact" }, { status: 502 });
  }
}
