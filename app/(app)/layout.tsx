import { Sidebar } from "@/components/layout/Sidebar";
import { TabBar } from "@/components/layout/TabBar";
import { TopBar } from "@/components/layout/TopBar";
import { TrialBanner } from "@/components/billing/TrialBanner";
import { TrialGate } from "@/components/billing/TrialGate";
import { VoiceButton } from "@/components/shared/VoiceButton";
import { createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

const MS_PER_DAY = 86_400_000;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let businessName = "";
  let planSlug = "";
  let trialEndsAt: string | null = null;
  let stripeSubscriptionId: string | null = null;
  let accountId: string | null = null;
  let vertical: Database["public"]["Enums"]["vertical"] | null = null;
  let activeRecipes: string[] = [];

  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: account } = await supabase
        .from("accounts")
        .select(
          "id, business_name, plan_slug, trial_ends_at, vertical, stripe_subscription_id",
        )
        .single();

      if (account) {
        accountId = account.id;
        businessName = account.business_name ?? "";
        planSlug = account.plan_slug ?? "";
        trialEndsAt = account.trial_ends_at;
        stripeSubscriptionId = account.stripe_subscription_id;
        vertical = account.vertical;

        const { data: activeRecipeRows } = await supabase
          .from("recipe_activations")
          .select("recipe_slug")
          .eq("account_id", account.id)
          .eq("status", "active");

        activeRecipes = (activeRecipeRows ?? []).map((row) => row.recipe_slug);
      }
    }
  } catch {
    // Fail gracefully — layout will render with fallback account values
  }

  const daysRemaining = trialEndsAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(trialEndsAt).getTime() - Date.now()) / MS_PER_DAY,
        ),
      )
    : 0;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Sidebar planSlug={planSlug} trialEndsAt={trialEndsAt} />
      <div className="md:ml-60">
        {planSlug === "trial" && (
          <TrialBanner daysRemaining={daysRemaining} />
        )}
        <TopBar businessName={businessName} />
        <main className="p-4 md:p-6 pb-20 md:pb-6 max-w-6xl mx-auto">
          <TrialGate
            trialEndsAt={trialEndsAt}
            planSlug={planSlug}
            stripeSubscriptionId={stripeSubscriptionId}
          >
            {children}
          </TrialGate>
        </main>
      </div>
      <VoiceButton
        accountId={accountId}
        vertical={vertical}
        activeRecipes={activeRecipes}
      />
      <TabBar />
    </div>
  );
}
