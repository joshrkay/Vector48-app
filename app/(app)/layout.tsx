import { Sidebar } from "@/components/layout/Sidebar";
import { TabBar } from "@/components/layout/TabBar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <main className="flex-1 px-4 py-6 pb-20 lg:px-8 lg:pb-6">
        {children}
      </main>
      <TabBar />
    </div>
  );
}
