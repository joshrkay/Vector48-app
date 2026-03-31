import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { computeIntegrationWarnings } from "@/lib/settings/integrationWarnings";

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

  const { data: pricing } = await supabase
    .from("pricing_config")
    .select("*")
    .order("monthly_price_cents");

  const { data: integrations } = await supabase
    .from("integrations")
    .select("*")
    .eq("account_id", account.id);

  const warnings = await computeIntegrationWarnings(supabase, account.id);

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const ownerName =
    (typeof meta?.full_name === "string" ? meta.full_name : "") ||
    (typeof meta?.name === "string" ? meta.name : "") ||
    "";

  return (
    <SettingsPage
      account={account}
      integrations={integrations ?? []}
      pricingConfig={pricing ?? []}
      ownerEmail={user.email ?? ""}
      ownerName={ownerName}
      integrationWarnings={{
        jobber: warnings.jobber,
        servicetitan: warnings.servicetitan,
        google_business: warnings.google_business,
      }}
    />
  );
}
