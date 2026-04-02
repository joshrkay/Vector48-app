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
  const [retryingId, setRetryingId] = useState<string | null>(null);
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

  async function retryProvisioning(id: string, accountId: string) {
    try {
      setRetryingId(id);
      const response = await fetch("/api/onboarding/provision/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });

      if (!response.ok && response.status !== 409) {
        throw new Error(`Request failed: ${response.status}`);
      }

      setAlerts((current) => current.filter((alert) => alert.id !== id));
    } catch (error) {
      console.error("[dashboard] failed to retry provisioning", error);
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div className="mt-6 space-y-3">
      {visibleAlerts.map((alert) => {
        const isDismissing = dismissingId === alert.id;
        const detail =
          alert.detail && typeof alert.detail === "object"
            ? (alert.detail as Record<string, unknown>)
            : {};
        const retryAccountId =
          detail.kind === "ghl_provisioning_failed" &&
          typeof detail.retry_account_id === "string"
            ? detail.retry_account_id
            : null;
        const isRetrying = retryingId === alert.id;
        const canDismiss = detail.dismissible !== false && !retryAccountId;

        return (
          <div
            key={alert.id}
            className="flex items-start gap-3 rounded-r-xl border-l-4 border-[#F59E0B] bg-[#FFFBEB] px-4 py-3"
          >
            <AlertTriangle
              className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#F59E0B]"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[#0F1923]">{alert.summary}</p>
              {detail.kind === "phone_setup_manual" &&
              typeof detail.action_text === "string" ? (
                <p className="mt-1 text-xs text-[#92400E]">{detail.action_text}</p>
              ) : null}
            </div>
            {retryAccountId ? (
              <button
                type="button"
                onClick={() => void retryProvisioning(alert.id, retryAccountId)}
                disabled={isRetrying}
                className="shrink-0 rounded-lg bg-[#B45309] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#92400E] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRetrying ? "Retrying..." : "Retry setup"}
              </button>
            ) : null}
            {canDismiss ? (
              <button
                type="button"
                onClick={() => void dismissAlert(alert.id)}
                disabled={isDismissing}
                className="shrink-0 text-[#64748B] transition hover:text-[#0F1923] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Dismiss alert"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
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
