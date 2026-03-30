import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export interface AccountSession {
  userId: string;
  accountId: string;
}

export async function requireAccountForUser(
  supabase: SupabaseClient<Database>,
): Promise<AccountSession | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: account } = await supabase
    .from("accounts")
    .select("id, account_status")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!account || account.account_status === "deleted") {
    return null;
  }

  return { userId: user.id, accountId: account.id };
}
