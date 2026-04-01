import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { ghlGet } from "@/lib/ghl/client";

export async function GET() {
  const startedAt = Date.now();

  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: account, error } = await supabase
      .from("accounts")
      .select("ghl_location_id")
      .eq("owner_user_id", user.id)
      .single();

    if (error || !account?.ghl_location_id) {
      return NextResponse.json({ status: "error", latencyMs: Date.now() - startedAt }, { status: 200 });
    }

    await ghlGet("/contacts/", {
      locationId: account.ghl_location_id,
      params: { limit: 1 },
    });

    return NextResponse.json({
      status: "connected",
      latencyMs: Date.now() - startedAt,
    });
  } catch {
    return NextResponse.json({
      status: "error",
      latencyMs: Date.now() - startedAt,
    });
  }
}
