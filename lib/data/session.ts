import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";

export const getSessionData = cache(async () => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, account: null };
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name, plan_slug, trial_ends_at, onboarding_done_at")
    .eq("owner_user_id", user.id)
    .single();

  return { user, account };
});
