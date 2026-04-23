import { notFound, redirect } from "next/navigation";

import { requireAccountForUser } from "@/lib/auth/account";
import { isOpsAdmin } from "@/lib/auth/opsAdmin";
import { computeOpsMetrics, type OpsMetric } from "@/lib/ops/metrics";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Ops-only dashboard. Gated by OPS_ADMIN_EMAILS env allowlist so platform
// operators can see cross-tenant health without ever exposing this data to
// customer admins.
export default async function OpsDashboardPage() {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) redirect("/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isOpsAdmin(user?.email ?? null)) {
    // Pretend this route doesn't exist for non-ops users. No 403 — we don't
    // want to leak that a privileged route lives at this path.
    notFound();
  }

  const metrics = await computeOpsMetrics();

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-bold">Ops dashboard</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Cross-tenant health, funnel, and margin — refreshes per request.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => (
          <MetricCard key={metric.key} metric={metric} />
        ))}
      </div>
    </div>
  );
}

function MetricCard({ metric }: { metric: OpsMetric }) {
  const severityColor = (() => {
    switch (metric.severity) {
      case "crit":
        return "border-red-300 bg-red-50";
      case "warn":
        return "border-amber-300 bg-amber-50";
      case "unknown":
        return "border-gray-200 bg-gray-50";
      default:
        return "border-[var(--v48-border)] bg-white";
    }
  })();

  return (
    <div className={`rounded-2xl border p-4 ${severityColor}`}>
      <div className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
        {metric.label}
      </div>
      <div className="mt-1 font-heading text-2xl font-bold">
        {formatMetric(metric)}
      </div>
    </div>
  );
}

function formatMetric(metric: OpsMetric): string {
  if (metric.value === null) return "—";
  switch (metric.unit) {
    case "percent":
      return `${metric.value.toFixed(1)}%`;
    case "usd":
      return `$${metric.value.toFixed(2)}`;
    case "seconds":
      return `${metric.value.toFixed(1)}s`;
    default:
      return metric.value.toLocaleString();
  }
}
