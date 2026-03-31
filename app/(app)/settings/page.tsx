import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { buildIntegrationStatus } from "@/lib/integrations/buildIntegrationStatus";

export default async function SettingsRoutePage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("*")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!account) {
    redirect("/login");
  }

  const integrationStatus = await buildIntegrationStatus(supabase, account);

  return (
    <SettingsPage account={account} integrationStatus={integrationStatus} />
  );
}
