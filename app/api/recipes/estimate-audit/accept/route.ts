import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { acceptBodySchema } from "@/lib/recipes/estimate-audit/schema";

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("owner_user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = acceptBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { auditLogId, acceptedSuggestions } = parsed.data;

  const payload = acceptedSuggestions.map((s) => ({
    item: s.item,
    reason: s.reason,
    estimatedValue: s.estimatedValue,
  }));

  const { data: updated, error } = await supabase
    .from("estimate_audit_log")
    .update({
      accepted_suggestions: payload,
    })
    .eq("id", auditLogId)
    .eq("account_id", account.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[estimate-audit/accept] update failed", error.message);
    return NextResponse.json({ error: "Could not save acceptance" }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
