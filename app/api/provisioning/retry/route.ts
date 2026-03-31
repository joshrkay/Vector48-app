import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { provisionCustomer } from "@/lib/ghl/provisionCustomer";

export async function POST() {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await provisionCustomer(session.accountId);
    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Provisioning failed";
    console.error("[provisioning/retry]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
