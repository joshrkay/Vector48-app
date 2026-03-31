"use client";

import type { PricingRow } from "./types";

export function BillingSection({
  pricingConfig,
  planSlug,
}: {
  pricingConfig: PricingRow[];
  planSlug: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm md:p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Plans
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Your current plan: <span className="font-medium text-foreground">{planSlug}</span>
      </p>
      <ul className="mt-4 space-y-3">
        {pricingConfig.map((p) => (
          <li
            key={p.plan_slug}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <span className="font-medium">{p.display_name}</span>
            <span className="text-muted-foreground">
              ${(p.monthly_price_cents / 100).toFixed(0)}/mo
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
