import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireAccountForUser } from "@/lib/auth/account";
import { isOpsAdmin } from "@/lib/auth/opsAdmin";
import {
  listWebhookFailures,
  summarizeWebhookFailures,
  type WebhookFailureRow,
} from "@/lib/ops/webhookFailures";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PROVIDERS = ["all", "ghl", "stripe"] as const;
type ProviderFilter = (typeof PROVIDERS)[number];

interface PageProps {
  searchParams: Promise<{ provider?: string }>;
}

export default async function WebhookFailuresPage({ searchParams }: PageProps) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) redirect("/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isOpsAdmin(user?.email ?? null)) notFound();

  const params = await searchParams;
  const providerFilter = (PROVIDERS as readonly string[]).includes(
    params.provider ?? "",
  )
    ? (params.provider as ProviderFilter)
    : ("all" as ProviderFilter);
  const providerForQuery =
    providerFilter === "all" ? undefined : (providerFilter as "ghl" | "stripe");

  const [rows, summary] = await Promise.all([
    listWebhookFailures({ provider: providerForQuery, limit: 100 }),
    summarizeWebhookFailures(providerForQuery),
  ]);

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-bold">Webhook failures</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Signature + authentication rejections for GHL and Stripe webhook
          deliveries. Shows the last 100 matching rows; totals below cover
          longer windows.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {PROVIDERS.map((p) => (
          <Link
            key={p}
            href={p === "all" ? "./webhook-failures" : `./webhook-failures?provider=${p}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              providerFilter === p
                ? "border-[var(--v48-accent)] bg-[var(--v48-accent)] text-white"
                : "border-[var(--v48-border)] bg-white text-[var(--text-primary)]"
            }`}
          >
            {p.toUpperCase()}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Last 24h" value={summary.last24h} severity={summary.last24h > 10 ? "warn" : "ok"} />
        <SummaryCard label="Last 7d" value={summary.last7d} severity={summary.last7d > 50 ? "warn" : "ok"} />
        <SummaryCard label="Last 30d" value={summary.last30d} severity="ok" />
      </div>

      <FailuresTable rows={rows} />

      <section className="space-y-2 rounded-2xl border border-[var(--v48-border)] bg-white p-4 text-sm">
        <h2 className="font-heading text-base font-semibold">Triage guide</h2>
        <p>
          <strong>reason: invalid_ed25519_signature / invalid_rsa_signature</strong>
          {" "}— signing-key mismatch. Verify the GHL marketplace app is publishing
          to this environment and that <code>GHL_WEBHOOK_SECRET</code> hasn&apos;t
          rotated.
        </p>
        <p>
          <strong>reason: missing_signature</strong> — the sender is not signing.
          For GHL this usually means a stale integration (re-register the webhook
          in the marketplace dashboard). In production, <code>GHL_WEBHOOK_ALLOW_UNSIGNED</code>{" "}
          must be unset.
        </p>
        <p>
          <strong>provider: stripe</strong> — signature rejection means the
          Stripe webhook secret on this environment does not match the endpoint
          configured in Stripe. Rotate and re-deploy <code>STRIPE_WEBHOOK_SECRET</code>.
        </p>
        <p>
          <strong>account_id: null</strong> — the webhook arrived but we could
          not match the location to an account. Not an auth failure per se;
          investigate whether the account was deleted or the GHL location
          rebound to a different tenant.
        </p>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  severity,
}: {
  label: string;
  value: number;
  severity: "ok" | "warn";
}) {
  const border = severity === "warn" ? "border-amber-300 bg-amber-50" : "border-[var(--v48-border)] bg-white";
  return (
    <div className={`rounded-2xl border p-4 ${border}`}>
      <div className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">{label}</div>
      <div className="mt-1 font-heading text-2xl font-bold">{value.toLocaleString()}</div>
    </div>
  );
}

function FailuresTable({ rows }: { rows: WebhookFailureRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--v48-border)] bg-white p-6 text-sm text-[var(--text-secondary)]">
        No webhook failures in this window. If you expected failures here, verify
        that the webhook routes are wiring{" "}
        <code>recordWebhookFailure</code> correctly.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--v48-border)] bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-[var(--text-secondary)]">
          <tr>
            <th className="px-4 py-3">Time</th>
            <th className="px-4 py-3">Provider</th>
            <th className="px-4 py-3">Event</th>
            <th className="px-4 py-3">Account</th>
            <th className="px-4 py-3">Reason</th>
            <th className="px-4 py-3">Hash</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-[var(--v48-border)]">
              <td className="px-4 py-3 font-mono text-xs">
                {new Date(row.created_at).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-xs uppercase">{row.provider}</td>
              <td className="px-4 py-3 text-xs">{row.event_type ?? "—"}</td>
              <td className="px-4 py-3 font-mono text-xs">
                {row.account_id ? row.account_id.slice(0, 8) : "—"}
              </td>
              <td className="px-4 py-3 text-xs">{row.reason}</td>
              <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">
                {row.payload_hash ? row.payload_hash.slice(0, 10) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
