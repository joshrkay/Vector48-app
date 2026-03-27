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
  if (!account) {
    const { data: newAccount } = await supabase
      .from("accounts")
      .insert({
        owner_user_id: user.id,
        business_name: "",
        vertical: "hvac", // default, will be changed in wizard
      })
      .select()
      .single();

    if (newAccount) {
      await supabase.from("account_users").insert({
        account_id: newAccount.id,
        user_id: user.id,
        role: "admin",
      });
      account = newAccount;
    }
  }

  // If onboarding already done, go to dashboard
  if (account?.onboarding_done_at) {
    redirect("/dashboard");
  }

  if (!account) {
    redirect("/login");
  }

  return (
    <WizardShell
      accountId={account.id}
      initialData={{
        businessName: account.business_name || "",
        vertical: account.vertical || "",
        phone: account.phone || "",
        serviceArea: account.service_area || "",
        businessHours: account.business_hours
          ? {
              preset: (account.business_hours as Record<string, string>).preset as "weekday_8_5" | "weekday_7_6" | "all_week" | "custom" || "weekday_8_5",
            }
          : { preset: "weekday_8_5" as const },
        voiceGender: (account.voice_gender as "male" | "female") || "male",
        voiceGreeting: account.voice_greeting || "",
        notificationSms: account.notification_sms ?? true,
        notificationEmail: account.notification_email ?? false,
        notificationContact: account.notification_contact || "",
        activateRecipe1: true,
        currentStep: account.onboarding_step || 0,
      }}
    />
  );
}
