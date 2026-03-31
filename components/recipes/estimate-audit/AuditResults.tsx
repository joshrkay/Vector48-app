"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AuditSuggestion } from "@/lib/recipes/estimate-audit/schema";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

interface AuditResultsProps {
  auditLogId: string | null;
  suggestions: AuditSuggestion[];
  /** Sum of all suggestion values from the latest analysis (API). */
  totalPotentialValue?: number | null;
  onHistoryRefresh?: () => void;
}

type RowState = "pending" | "accepted" | "ignored";

export function AuditResults({
  auditLogId,
  suggestions,
  totalPotentialValue,
  onHistoryRefresh,
}: AuditResultsProps) {
  const [states, setStates] = React.useState<RowState[]>(() =>
    suggestions.map(() => "pending"),
  );
  const [acceptError, setAcceptError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setStates(suggestions.map(() => "pending"));
  }, [suggestions]);

  const acceptedTotal = React.useMemo(() => {
    let sum = 0;
    suggestions.forEach((s, i) => {
      if (states[i] === "accepted") sum += s.estimatedValue;
    });
    return Math.round(sum * 100) / 100;
  }, [suggestions, states]);

  const postAccept = async (nextStates: RowState[]) => {
    if (!auditLogId) return;
    const accepted: AuditSuggestion[] = [];
    suggestions.forEach((s, i) => {
      if (nextStates[i] === "accepted") accepted.push(s);
    });
    setAcceptError(null);
    try {
      const res = await fetch("/api/recipes/estimate-audit/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auditLogId,
          acceptedSuggestions: accepted,
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) {
        setAcceptError(data.error ?? "Could not save");
        return;
      }
      onHistoryRefresh?.();
    } catch {
      setAcceptError("Could not save");
    }
  };

  const handleAccept = (index: number) => {
    setStates((prev) => {
      const next = prev.map((s, i) => (i === index ? "accepted" : s));
      void postAccept(next);
      return next;
    });
  };

  const handleIgnore = (index: number) => {
    setStates((prev) => {
      const next = prev.map((s, i) => (i === index ? "ignored" : s));
      void postAccept(next);
      return next;
    });
  };

  if (suggestions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Run an analysis to see suggestions here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-muted/40 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Accepted value
          </p>
          <p className="text-2xl font-semibold tabular-nums text-[var(--v48-accent)]">
            {currency.format(acceptedTotal)}
          </p>
        </div>
        {totalPotentialValue != null && (
          <div className="rounded-lg border bg-muted/40 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total potential
            </p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {currency.format(totalPotentialValue)}
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Estimates are approximate and based on typical market rates.
      </p>

      {acceptError && (
        <p className="text-sm text-destructive">{acceptError}</p>
      )}

      <ul className="space-y-3">
        {suggestions.map((s, i) => (
          <li key={`${s.item}-${i}`}>
            <Card
              className={cn(
                "transition-opacity",
                states[i] === "ignored" && "opacity-45",
              )}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold leading-snug">
                  {s.item}
                </CardTitle>
                <CardDescription className="text-sm leading-relaxed text-foreground/80">
                  {s.reason}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-0">
                <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {currency.format(s.estimatedValue)}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    disabled={states[i] !== "pending"}
                    onClick={() => handleAccept(i)}
                  >
                    Accept
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={states[i] !== "pending"}
                    onClick={() => handleIgnore(i)}
                  >
                    Ignore
                  </Button>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
