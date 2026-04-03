import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { WizardShell } from "./_steps/WizardShell";

export default async function OnboardingPage() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch existing account via account_users join
  const { data: membership } = await supabase
    .from("account_users")
    .select("account_id")
    .eq("user_id", user.id)
    .single();

  let account = null;

  if (membership) {
    const { data } = await supabase
      .from("accounts")
      .select("*")
      .eq("id", membership.account_id)
      .single();
    account = data;
  }

  // If no account exists yet, create one with minimal data
  // The trg_accounts_create_owner trigger auto-creates the account_users row
  if (!account) {
    const { data: newAccount } = await supabase
      .from("accounts")
      .insert({
        owner_user_id: user.id,
        business_name: "",
      })
      .select()
      .single();

    account = newAccount;
  }

  // If onboarding already done, go to dashboard
  if (
    account?.onboarding_completed_at ||
    account?.ghl_provisioning_status === "failed"
  ) {
    redirect("/dashboard");
  }

  if (!account) {
    redirect("/login");
  }

  const prefs =
    account.notification_preferences &&
    typeof account.notification_preferences === "object"
      ? (account.notification_preferences as Record<string, unknown>)
      : {};

  return (
    <WizardShell
      accountId={account.id}
      initialData={{
        businessName: account.business_name || "",
        vertical: account.vertical || "",
        phone: account.phone || "",
        businessHours: account.business_hours
          ? {
              preset: (account.business_hours as Record<string, string>).preset as "weekday_8_5" | "weekday_7_6" | "all_week" | "custom" || "weekday_8_5",
            }
          : { preset: "weekday_8_5" as const },
        voiceGender: (account.voice_gender as "male" | "female") || "male",
        voiceGreeting: account.greeting_text || "",
        notificationContact: account.notification_contact_name || "",
        notificationSms: (account.notification_preferences as Record<string, unknown>)?.sms as boolean ?? false,
        notificationPreferences: prefs,
        activateRecipe1: true,
        currentStep: account.onboarding_step || 0,
      }}
    />
  );
}
