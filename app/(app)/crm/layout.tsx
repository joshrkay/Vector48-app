import { CRMBreadcrumb } from "@/components/crm/CRMBreadcrumb";
import { CRMSearchBar } from "@/components/crm/CRMSearchBar";
import { GHLConnectionStatus } from "@/components/crm/GHLConnectionStatus";

export default function CRMLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-3 md:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CRMBreadcrumb />
          <GHLConnectionStatus />
        </div>
        <div className="mt-3">
          <CRMSearchBar />
        </div>
      </div>

      <section>{children}</section>
    </div>
  );
}
