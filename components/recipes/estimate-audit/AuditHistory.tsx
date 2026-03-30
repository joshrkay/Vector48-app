"use client";

import * as React from "react";
import { createBrowserClient } from "@/lib/supabase/client";

interface Row {
  id: string;
  created_at: string;
  job_type: string;
  suggestions: unknown;
  accepted_suggestions: unknown;
  accepted_value_total: number | null;
}

export function AuditHistory() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createBrowserClient();
    const { data, error: qErr } = await supabase
      .from("estimate_audit_log")
      .select(
        "id, created_at, job_type, suggestions, accepted_suggestions, accepted_value_total",
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (qErr) {
      setError("Could not load history");
      setRows([]);
    } else {
      setRows((data ?? []) as Row[]);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const dateFmt = React.useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [],
  );

  return (
    <section className="mt-10 border-t pt-8">
      <h2 className="font-heading text-lg font-semibold">Past audits</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Recent estimate audits for your account.
      </p>

      {loading && (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      )}
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {!loading && !error && rows.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          No audits yet. Run an analysis above.
        </p>
      )}

      {!loading && rows.length > 0 && (
        <ul className="mt-4 space-y-2">
          {rows.map((r) => {
            const suggestionCount = Array.isArray(r.suggestions)
              ? r.suggestions.length
              : 0;
            const acceptedCount = Array.isArray(r.accepted_suggestions)
              ? r.accepted_suggestions.length
              : 0;
            const recovered =
              r.accepted_value_total != null
                ? new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0,
                  }).format(r.accepted_value_total)
                : "—";

            return (
              <li
                key={r.id}
                className="flex flex-col gap-1 rounded-lg border bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <span className="font-medium">{r.job_type}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {dateFmt.format(new Date(r.created_at))}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {suggestionCount} suggestions
                  {acceptedCount > 0
                    ? ` · ${acceptedCount} accepted`
                    : ""}
                  {" · "}
                  <span className="tabular-nums text-foreground">{recovered}</span>{" "}
                  recovered
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
