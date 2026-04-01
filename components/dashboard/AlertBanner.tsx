"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

import type { Database } from "@/lib/supabase/types";

type AutomationEvent = Database["public"]["Tables"]["automation_events"]["Row"];

interface AlertBannerProps {
  initialAlerts: AutomationEvent[];
}

export function AlertBanner({ initialAlerts }: AlertBannerProps) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const visibleAlerts = useMemo(
    () => (showAll ? alerts : alerts.slice(0, 2)),
    [alerts, showAll],
  );

  const hiddenCount = Math.max(alerts.length - visibleAlerts.length, 0);

  if (alerts.length === 0) {
    return null;
  }

  async function dismissAlert(id: string) {
    try {
      setDismissingId(id);

      const response = await fetch(`/api/dashboard/alerts/${id}`, {
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      setAlerts((current) => current.filter((alert) => alert.id !== id));
    } catch (error) {
      console.error("[dashboard] failed to dismiss alert", error);
    } finally {
      setDismissingId(null);
    }
  }

  return (
    <div className="mt-6 space-y-3">
      {visibleAlerts.map((alert) => {
        const isDismissing = dismissingId === alert.id;

        return (
          <div
            key={alert.id}
            className="flex items-start gap-3 rounded-r-xl border-l-4 border-[#F59E0B] bg-[#FFFBEB] px-4 py-3"
          >
            <AlertTriangle
              className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#F59E0B]"
            />
            <p className="min-w-0 flex-1 text-sm text-[#0F1923]">{alert.summary}</p>
            <button
              type="button"
              onClick={() => void dismissAlert(alert.id)}
              disabled={isDismissing}
              className="shrink-0 text-[#64748B] transition hover:text-[#0F1923] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Dismiss alert"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}

      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-sm text-[#B45309] underline-offset-2 hover:underline"
        >
          and {hiddenCount} more
        </button>
      ) : null}
    </div>
  );
}
