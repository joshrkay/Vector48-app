import { redirect } from "next/navigation";
import { getSessionData } from "@/lib/data/session";
import { Sidebar } from "@/components/layout/Sidebar";
import { TabBar } from "@/components/layout/TabBar";
import { TopBar } from "@/components/layout/TopBar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, account } = await getSessionData();

  if (!user || !account) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Sidebar
        planSlug={account.plan_slug}
        trialEndsAt={account.trial_ends_at}
      />
      <div className="md:ml-60">
        <TopBar businessName={account.business_name} />
        <main className="p-4 md:p-6 pb-20 md:pb-6 max-w-6xl mx-auto">
          {children}
        </main>
      </div>
      <TabBar />
    </div>
  );
}
