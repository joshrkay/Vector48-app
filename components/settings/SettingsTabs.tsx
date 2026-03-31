"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { BusinessProfileForm } from "./BusinessProfileForm";
import { VoiceSettings } from "./VoiceSettings";
import { NotificationSettings } from "./NotificationSettings";
import { IntegrationTile } from "./IntegrationTile";
import { AccountSection } from "./AccountSection";
import { BillingSection } from "./BillingSection";
import type { AccountRow, IntegrationRow, PricingRow } from "./types";

const VALID = new Set([
  "profile",
  "voice",
  "notifications",
  "integrations",
  "billing",
  "account",
]);

export function SettingsTabs({
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab") ?? "profile";
  const tab = VALID.has(raw) ? raw : "profile";

  const onTabChange = React.useCallback(
    (v: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("tab", v);
      router.replace(`/settings?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  React.useEffect(() => {
    const err = searchParams.get("error");
    if (err && tab === "integrations") {
      toast.error(`Integration error: ${err}`);
    }
  }, [searchParams, tab]);

  const integrationByProvider = React.useMemo(() => {
    const m = new Map<
      IntegrationRow["provider"],
      IntegrationRow | undefined
    >();
    for (const row of integrations) {
      m.set(row.provider, row);
    }
    return m;
  }, [integrations]);

  return (
    <Tabs value={tab} onValueChange={onTabChange} className="w-full">
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <TabsList
          className={cn(
            "flex h-auto w-full flex-row overflow-x-auto md:w-52 md:flex-col md:items-stretch md:overflow-visible",
            "rounded-xl border bg-card p-1",
          )}
        >
          {(
            [
              ["profile", "Business"],
              ["voice", "Voice"],
              ["notifications", "Alerts"],
              ["integrations", "Integrations"],
              ["billing", "Billing"],
              ["account", "Account"],
            ] as const
          ).map(([id, label]) => (
            <TabsTrigger
              key={id}
              value={id}
              className="justify-start whitespace-nowrap px-3 py-2.5 md:w-full"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="min-w-0 flex-1">
          <TabsContent value="profile" className="mt-0">
            <BusinessProfileForm account={account} />
          </TabsContent>
          <TabsContent value="voice" className="mt-0">
            <VoiceSettings account={account} />
          </TabsContent>
          <TabsContent value="notifications" className="mt-0">
            <NotificationSettings account={account} />
          </TabsContent>
          <TabsContent value="integrations" className="mt-0 space-y-4">
            <IntegrationTile
              provider="jobber"
              label="Jobber"
              description="Sync jobs and customers."
              integration={integrationByProvider.get("jobber")}
              warning={integrationWarnings.jobber}
            />
            <IntegrationTile
              provider="servicetitan"
              label="ServiceTitan"
              description="Connect your ServiceTitan account."
              integration={integrationByProvider.get("servicetitan")}
              warning={integrationWarnings.servicetitan}
            />
            <IntegrationTile
              provider="google_business"
              label="Google Business Profile"
              description="Reviews and business presence."
              integration={integrationByProvider.get("google_business")}
              warning={integrationWarnings.google_business}
            />
          </TabsContent>
          <TabsContent value="billing" className="mt-0">
            <BillingSection pricingConfig={pricingConfig} planSlug={account.plan_slug} />
          </TabsContent>
          <TabsContent value="account" className="mt-0">
            <AccountSection ownerEmail={ownerEmail} ownerName={ownerName} />
          </TabsContent>
        </div>
      </div>
    </Tabs>
  );
}
