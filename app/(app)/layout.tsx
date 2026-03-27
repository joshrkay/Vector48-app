import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { TabBar } from "@/components/layout/TabBar";
import { TopBar } from "@/components/layout/TopBar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch account data for the current user
  const { data: account } = await supabase
    .from("accounts")
    .select("business_name, plan_slug, trial_ends_at")
    .single();

  const businessName = account?.business_name ?? "Your Business";
  const planSlug = account?.plan_slug ?? "trial";
  const trialEndsAt = account?.trial_ends_at ?? null;

  // Calculate trial days remaining
  let trialDaysLeft = 0;
  if (trialEndsAt) {
    trialDaysLeft = Math.max(
      0,
      Math.ceil(
        (new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Sidebar planSlug={planSlug} trialDaysLeft={trialDaysLeft} />
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
