"use client";

import * as React from "react";
import { Suspense } from "react";
import { SettingsTabs } from "./SettingsTabs";
import type { AccountRow, IntegrationRow, PricingRow } from "./types";

export function SettingsPage({
  account,
  integrations,
  pricingConfig,
  ownerEmail,
  ownerName,
  integrationWarnings,
}: {
  account: AccountRow;
  integrations: IntegrationRow[];
  pricingConfig: PricingRow[];
  ownerEmail: string;
  ownerName: string;
  integrationWarnings: {
    jobber: boolean;
    servicetitan: boolean;
    google_business: boolean;
  };
}) {
  return (
    <div>
      <h1 className="font-heading text-2xl font-bold md:text-[28px]">Settings</h1>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
        Manage your business profile, voice, alerts, integrations, and account.
      </p>
      <div className="mt-8">
        <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
          <SettingsTabs
            account={account}
            integrations={integrations}
            pricingConfig={pricingConfig}
            ownerEmail={ownerEmail}
            ownerName={ownerName}
            integrationWarnings={integrationWarnings}
          />
        </Suspense>
      </div>
    </div>
  );
}
