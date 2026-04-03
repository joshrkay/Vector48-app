import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { provisionGhlSubAccountForAccount } from "@/lib/ghl/provisioning";

type ProvisionRequest = {
  account_id?: string;
};

export async function POST(req: Request) {
  let body: ProvisionRequest;
  try {
    body = (await req.json()) as ProvisionRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const accountId = body.account_id?.trim();
  if (!accountId) {
    return NextResponse.json({ error: "account_id is required" }, { status: 400 });
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("account_users")
    .select("account_id")
    .eq("account_id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await provisionGhlSubAccountForAccount({
      accountId,
      ownerEmail: user.email,
    });

    return NextResponse.json({
      ok: true,
      location_id: result.locationId,
      used_agency_key_fallback: result.usedAgencyKeyFallback,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Provisioning failed" },
      { status: 502 },
    );
  }
}
