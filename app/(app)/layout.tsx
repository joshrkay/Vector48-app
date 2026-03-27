import { Sidebar } from "@/components/layout/Sidebar";
import { TabBar } from "@/components/layout/TabBar";
import { TopBar } from "@/components/layout/TopBar";
import { createServerClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let planSlug: string | undefined;
  let trialDaysLeft: number | undefined;

  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: account } = await supabase
        .from("accounts")
        .select("business_name, plan_slug, trial_ends_at")
        .single();

      if (account) {
        planSlug = account.plan_slug;
        if (account.trial_ends_at) {
          trialDaysLeft = Math.max(
            0,
            Math.ceil(
              (new Date(account.trial_ends_at).getTime() - Date.now()) /
                86400000
            )
          );
        }
      }
    }
  } catch {
    // Fail gracefully — sidebar will render without trial info
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Sidebar planSlug={planSlug} trialDaysLeft={trialDaysLeft} />
      <div className="md:ml-60">
        <TopBar />
        <main className="p-4 md:p-6 pb-20 md:pb-6 max-w-6xl mx-auto">
          {children}
        </main>
      </div>
      <TabBar />
    </div>
  );
}
