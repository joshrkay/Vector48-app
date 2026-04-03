"use client";

import { useState } from "react";
import { Check, Minus } from "lucide-react";
import { toast } from "sonner";
import type { PricingConfig } from "@/lib/stripe/config";

interface PlanComparisonTableProps {
  pricingConfig: PricingConfig[];
  currentPlanSlug: string;
}

function syncSpeed(ttlSeconds: number): string {
  if (ttlSeconds <= 30) return "30 sec";
  if (ttlSeconds <= 60) return "1 min";
  return "5 min";
}

function supportTier(features: Record<string, unknown>): string {
  const s = features["support"];
  if (s === "dedicated") return "Dedicated";
  if (s === "priority") return "Priority";
  if (s === "email") return "Email";
  return "Community";
}

export function PlanComparisonTable({
  pricingConfig,
  currentPlanSlug,
}: PlanComparisonTableProps) {
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);

  // Show only non-trial, active plans + trial for comparison
  const plans = pricingConfig.filter((p) => p.plan_slug !== "custom");

  async function handleSelect(planSlug: string) {
    if (planSlug === currentPlanSlug) return;
    setLoadingSlug(planSlug);
    try {
      const res = await fetch("/api/billing/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug }),
      });
      const json = await res.json() as { url?: string; error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "Unable to start checkout. Please try again.");
        return;
      }
      if (json.url) window.location.href = json.url;
    } catch {
      toast.error("Unable to connect to payment processor. Please try again.");
    } finally {
      setLoadingSlug(null);
    }
  }

  const rows: { label: string; getValue: (p: PricingConfig) => React.ReactNode }[] = [
    {
      label: "Price",
      getValue: (p) =>
        p.monthly_price_cents === 0
          ? "Free"
          : `$${(p.monthly_price_cents / 100).toFixed(0)}/mo`,
    },
    {
      label: "Active Recipes",
      getValue: (p) =>
        p.max_active_recipes >= 999 ? "Unlimited" : String(p.max_active_recipes),
    },
    {
      label: "GHL Sync Speed",
      getValue: (p) => syncSpeed(p.ghl_cache_ttl_seconds),
    },
    {
      label: "Webhooks",
      getValue: (p) =>
        p.webhooks_enabled ? (
          <Check size={16} className="mx-auto text-teal-500" />
        ) : (
          <Minus size={16} className="mx-auto text-gray-300" />
        ),
    },
    {
      label: "Support",
      getValue: (p) => supportTier(p.features as Record<string, unknown>),
    },
  ];

  return (
    <div className="rounded-2xl border bg-white p-6">
      <h2 className="font-heading text-[16px] font-bold">Compare Plans</h2>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="w-36 pb-3 text-left font-medium text-gray-400" />
              {plans.map((p) => (
                <th
                  key={p.plan_slug}
                  className={`pb-3 text-center font-heading font-bold ${
                    p.plan_slug === currentPlanSlug
                      ? "text-[#00B4A6]"
                      : "text-gray-900"
                  }`}
                >
                  {p.display_name}
                  {p.plan_slug === currentPlanSlug && (
                    <span className="ml-1.5 inline-block rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700">
                      Current
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="py-3 pr-4 text-left text-gray-500">{row.label}</td>
                {plans.map((p) => (
                  <td
                    key={p.plan_slug}
                    className={`py-3 text-center ${
                      p.plan_slug === currentPlanSlug
                        ? "border-x-2 border-[#00B4A6] bg-teal-50/30"
                        : ""
                    }`}
                  >
                    {row.getValue(p)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="pt-4" />
              {plans.map((p) => (
                <td
                  key={p.plan_slug}
                  className={`pt-4 text-center ${
                    p.plan_slug === currentPlanSlug
                      ? "border-x-2 border-b-2 border-[#00B4A6] pb-3"
                      : ""
                  }`}
                >
                  {p.plan_slug !== currentPlanSlug && p.plan_slug !== "trial" && (
                    <button
                      onClick={() => handleSelect(p.plan_slug)}
                      disabled={loadingSlug !== null}
                      className="rounded-lg border border-[#00B4A6] px-3 py-1.5 text-xs font-semibold text-[#00B4A6] transition-colors hover:bg-teal-50 disabled:opacity-50"
                    >
                      {loadingSlug === p.plan_slug ? "Loading…" : "Select"}
                    </button>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
