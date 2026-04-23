import { cache } from "react";
import { requireAccountForUser } from "@/lib/auth/account";
import { createServerClient } from "@/lib/supabase/server";

export const getSessionData = cache(async () => {
  const supabase = await createServerClient();

  const session = await requireAccountForUser(supabase);
  if (!session) {
    return { user: null, account: null };
  }

  const { data: account } = await supabase
    .from("accounts")
    .select(
      "id, business_name, plan_slug, trial_ends_at, onboarding_completed_at, ghl_provisioning_status",
    )
    .eq("id", session.accountId)
    .maybeSingle();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user: user ?? null, account: account ?? null };
});
