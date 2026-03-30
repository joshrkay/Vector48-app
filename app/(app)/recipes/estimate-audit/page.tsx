"use client";

import * as React from "react";
import { EstimateInput } from "@/components/recipes/estimate-audit/EstimateInput";
import { AuditResults } from "@/components/recipes/estimate-audit/AuditResults";
import { AuditHistory } from "@/components/recipes/estimate-audit/AuditHistory";
import { createBrowserClient } from "@/lib/supabase/client";
import type { EstimateVertical } from "@/components/recipes/estimate-audit/EstimateInput";
import type { AuditSuggestion } from "@/lib/recipes/estimate-audit/schema";

export default function EstimateAuditPage() {
  const [vertical, setVertical] = React.useState<EstimateVertical>("hvac");
  const [accountReady, setAccountReady] = React.useState(false);
  const [auditLogId, setAuditLogId] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<AuditSuggestion[]>([]);
  const [historyKey, setHistoryKey] = React.useState(0);

  React.useEffect(() => {
    const supabase = createBrowserClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: account } = await supabase
        .from("accounts")
        .select("vertical")
        .eq("owner_user_id", user.id)
        .single();
      if (account?.vertical) {
        setVertical(account.vertical);
      }
      setAccountReady(true);
    })();
  }, []);

  const refreshHistory = React.useCallback(() => {
    setHistoryKey((k) => k + 1);
  }, []);

  if (!accountReady) {
    return (
      <div className="text-sm text-muted-foreground">Loading…</div>
    );
  }

  return (
    <div>
      <h1 className="font-heading text-[28px] font-bold">Estimate Audit</h1>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
        Review estimates for missed line items, upsells, and pricing sanity
        before you send them. Suggestions are advisory, not requirements.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:items-start">
        <div className="rounded-xl border bg-card p-4 shadow-sm md:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Input
          </h2>
          <div className="mt-4">
            <EstimateInput
              defaultVertical={vertical}
              onAnalyzeSuccess={({ auditLogId: id, suggestions: list }) => {
                setAuditLogId(id);
                setSuggestions(list);
                setHistoryKey((k) => k + 1);
              }}
            />
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm md:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Suggestions
          </h2>
          <div className="mt-4">
            <AuditResults
              auditLogId={auditLogId}
              suggestions={suggestions}
              onHistoryRefresh={refreshHistory}
            />
          </div>
        </div>
      </div>

      <AuditHistory key={historyKey} />
    </div>
  );
}
