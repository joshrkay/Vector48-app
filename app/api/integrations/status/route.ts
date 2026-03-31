import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAccountForUser } from "@/lib/auth/account";
import {
  buildIntegrationStatus,
  type IntegrationStatusAccountInput,
} from "@/lib/integrations/buildIntegrationStatus";

// Only the columns buildIntegrationStatus actually reads — avoids fetching
// sensitive fields like ghl_token_encrypted into the response pipeline.
const ACCOUNT_SELECT = [
  "id",
  "ghl_provisioning_status",
  "ghl_location_id",
  "ghl_token_encrypted",
  "ghl_voice_agent_id",
  "ghl_last_synced_at",
  "voice_gender",
  "greeting_text",
  "phone",
].join(", ");

export async function GET() {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: account, error } = await supabase
    .from("accounts")
    .select(ACCOUNT_SELECT)
    .eq("id", session.accountId)
    .single();

  if (error || !account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const payload = await buildIntegrationStatus(
    supabase,
    account as unknown as IntegrationStatusAccountInput,
  );
  return NextResponse.json(payload);
}
