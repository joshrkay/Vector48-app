import { redirect } from "next/navigation";
import { getSessionData } from "@/lib/data/session";
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
  let trialEndsAt: string | null = null;
  let businessName = "";

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
        trialEndsAt = account.trial_ends_at ?? null;
        businessName = account.business_name ?? "";
      }
    }
  } catch {
    // Fail gracefully — sidebar will render without trial info
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Sidebar
        planSlug={planSlug ?? ""}
        trialEndsAt={trialEndsAt}
      />
      <div className="md:ml-60">
        <TopBar businessName={businessName} />
        <main className="p-4 md:p-6 pb-20 md:pb-6 max-w-6xl mx-auto">
          {children}
        </main>
      </div>
      <TabBar />
    </div>
  );
}
