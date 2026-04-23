import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { requireAccountForUser } from "@/lib/auth/account";
import { createServerClient } from "@/lib/supabase/server";
import { getReportData } from "@/lib/reports/queries";
import { RecipePerformanceTable } from "@/components/crm/reports/RecipePerformanceTable";
import { LeadSourceChart } from "@/components/crm/reports/LeadSourceChart";
import { PipelineFunnel } from "@/components/crm/reports/PipelineFunnel";
import { ContactGrowthChart } from "@/components/crm/reports/ContactGrowthChart";
import { ResponseTimeChart } from "@/components/crm/reports/ResponseTimeChart";

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--v48-border)] bg-white p-5">
      <h2 className="mb-4 font-heading text-base font-semibold text-[var(--text-primary)]">
        {title}
      </h2>
      {children}
    </div>
  );
}

export default async function ReportsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const session = await requireAccountForUser(supabase);
  if (!session) redirect("/login");

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", session.accountId)
    .maybeSingle();

  if (!account) redirect("/login");

  let data: Awaited<ReturnType<typeof getReportData>> | null = null;
  let loadError: string | null = null;
  try {
    data = await getReportData(account.id);
  } catch (error) {
    console.error("[reports-page]", error);
    loadError =
      "We couldn't load your reports right now. Please try again in a moment.";
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-bold md:text-[28px]">Reports</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Strategic performance overview — refreshes every 15 minutes.
        </p>
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {loadError}
        </div>
      ) : data ? (
        <>
          <SectionCard title="Recipe Performance (Last 30 Days)">
            <RecipePerformanceTable rows={data.recipePerformance} />
          </SectionCard>

          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard title="Lead Source Breakdown">
              <LeadSourceChart data={data.leadSources} />
            </SectionCard>

            <SectionCard title="Pipeline Conversion Funnel">
              <PipelineFunnel stages={data.pipelineFunnel} />
            </SectionCard>
          </div>

          <SectionCard title="Contact Growth (Last 12 Weeks)">
            <ContactGrowthChart data={data.contactGrowth} />
          </SectionCard>

          <SectionCard title="Response Time Distribution (Last 30 Days)">
            <ResponseTimeChart data={data.responseTimes} />
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
