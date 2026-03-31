"use client";

import * as React from "react";
import { Suspense } from "react";
import { SettingsTabs } from "./SettingsTabs";
import type { AccountRow } from "./types";
import type { IntegrationStatusPayload } from "@/lib/integrations/integrationStatusTypes";

export function SettingsPage({
  account,
  integrationStatus,
}: {
  account: AccountRow;
  integrationStatus: IntegrationStatusPayload;
}) {
  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-[#0F1E35] md:text-[28px]">
        Settings
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
        Manage your business profile, AI voice, notifications, and integrations.
      </p>
      <div className="mt-8">
        <Suspense
          fallback={
            <div className="text-sm text-muted-foreground">Loading…</div>
          }
        >
          <SettingsTabs
            account={account}
            integrationStatus={integrationStatus}
          />
        </Suspense>
      </div>
    </div>
  );
}
