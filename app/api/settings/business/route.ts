import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { businessPatchSchema } from "@/lib/validations/settings";
import { getGHLClient } from "@/lib/ghl/token";

export async function PATCH(req: Request) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = businessPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: true });
  }

  const { data: before } = await supabase
    .from("accounts")
    .select("business_name, ghl_location_id, ghl_token_encrypted")
    .eq("id", session.accountId)
    .single();

  const { error } = await supabase
    .from("accounts")
    .update(patch)
    .eq("id", session.accountId);

  if (error) {
    console.error("[settings/business]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const warnings: string[] = [];
  const nameChanged =
    patch.business_name !== undefined &&
    patch.business_name !== before?.business_name;

  if (
    nameChanged &&
    before?.ghl_location_id &&
    before?.ghl_token_encrypted
  ) {
    try {
      const client = await getGHLClient(session.accountId);
      await client.locations.update(before.ghl_location_id, {
        name: patch.business_name!,
      });
      await supabase
        .from("accounts")
        .update({ ghl_last_synced_at: new Date().toISOString() })
        .eq("id", session.accountId);
    } catch (e) {
      console.warn("[settings/business] ghl_location_sync", e);
      warnings.push("ghl_location_name");
    }
  }

  return NextResponse.json({
    success: true,
    warnings: warnings.length ? warnings : undefined,
  });
}
