"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { PricingConfig } from "@/lib/stripe/config";

interface CurrentPlanCardProps {
  planSlug: string;
  subscriptionStatus: string;
  currentPlan: PricingConfig | null;
  trialEndsAt: string | null;
  daysRemaining: number;
  renewsAt: number | null;
  /** Slug of the next tier to upgrade to. Null if already on the top plan. */
  upgradePlanSlug: string | null;
}

const MS_PER_DAY = 86_400_000;
const TRIAL_DAYS = 7;

export function CurrentPlanCard({
  planSlug,
  subscriptionStatus,
  currentPlan,
  trialEndsAt,
  daysRemaining,
  renewsAt,
  upgradePlanSlug,
}: CurrentPlanCardProps) {
  const [loading, setLoading] = useState(false);

  const isTrial = planSlug === "trial";
  const isActive = subscriptionStatus === "active";
  const isPastDue = subscriptionStatus === "past_due";

  const trialProgressPct = trialEndsAt
    ? Math.max(
        0,
        Math.min(
          100,
          ((TRIAL_DAYS - daysRemaining) / TRIAL_DAYS) * 100,
        ),
      )
    : 0;

  const renewsDate = renewsAt
    ? new Date(renewsAt * 1000).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  async function handleUpgrade() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug: upgradePlanSlug }),
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
      setLoading(false);
    }
  }

  const price = currentPlan
    ? `$${(currentPlan.monthly_price_cents / 100).toFixed(0)}/mo`
    : "$0/mo";

  const displayName = currentPlan?.display_name ?? planSlug;

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-[20px] font-bold">{displayName}</h2>
            {isTrial && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[12px] font-semibold text-amber-700">
                Trial
              </span>
            )}
            {isActive && (
              <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[12px] font-semibold text-teal-700">
                Active
              </span>
            )}
            {isPastDue && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[12px] font-semibold text-red-700">
                Past Due
              </span>
            )}
          </div>

          {isTrial && trialEndsAt && (
            <p className="mt-1 text-sm text-gray-500">
              {daysRemaining > 0
                ? `${daysRemaining} ${daysRemaining === 1 ? "day" : "days"} remaining`
                : "Trial expired"}
            </p>
          )}
          {isActive && renewsDate && (
            <p className="mt-1 text-sm text-gray-500">Renews {renewsDate}</p>
          )}
        </div>

        <p className="font-heading text-[32px] font-bold text-gray-900 tabular-nums">
          {price}
        </p>
      </div>

      {isTrial && trialEndsAt && (
        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-amber-100">
            <div
              className="h-full rounded-full bg-amber-400 transition-all"
              style={{ width: `${trialProgressPct}%` }}
            />
          </div>
        </div>
      )}

      {currentPlan && (
        <ul className="mt-4 space-y-1.5 text-sm text-gray-600">
          <li>
            {currentPlan.max_active_recipes >= 999
              ? "Unlimited active recipes"
              : `Up to ${currentPlan.max_active_recipes} active recipe${currentPlan.max_active_recipes === 1 ? "" : "s"}`}
          </li>
          <li>
            Webhooks:{" "}
            <span className={currentPlan.webhooks_enabled ? "text-teal-600" : "text-gray-400"}>
              {currentPlan.webhooks_enabled ? "Enabled" : "Not included"}
            </span>
          </li>
        </ul>
      )}

      {upgradePlanSlug && (
        <div className="mt-6">
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="rounded-xl bg-[#00B4A6] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#009e91] disabled:opacity-50"
          >
            {loading ? "Loading…" : "Upgrade Plan"}
          </button>
        </div>
      )}
    </div>
  );
}
