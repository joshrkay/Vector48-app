import { Sidebar } from "@/components/layout/Sidebar";
import { TabBar } from "@/components/layout/TabBar";
import { TopBar } from "@/components/layout/TopBar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Sidebar />
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
