"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BusinessProfileForm } from "./BusinessProfileForm";
import { VoiceSettings } from "./VoiceSettings";
import { NotificationSettings } from "./NotificationSettings";
import { SettingsIntegrations } from "./SettingsIntegrations";
import type { AccountRow } from "./types";
import type { IntegrationStatusPayload } from "@/lib/integrations/integrationStatusTypes";

const VALID = new Set([
  "business",
  "voice",
  "notifications",
  "integrations",
]);

export function SettingsTabs({
  account,
  integrationStatus,
}: {
  account: AccountRow;
  integrationStatus: IntegrationStatusPayload;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab") ?? "business";
  const normalized = raw === "profile" ? "business" : raw;
  const tab = VALID.has(normalized) ? normalized : "business";

  React.useEffect(() => {
    if (raw === "profile") {
      const next = new URLSearchParams(searchParams.toString());
      next.set("tab", "business");
      router.replace(`/settings?${next.toString()}`, { scroll: false });
    }
  }, [raw, router, searchParams]);

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

  const tabs: { id: string; label: string }[] = [
    { id: "business", label: "Business Profile" },
    { id: "voice", label: "AI Voice" },
    { id: "notifications", label: "Notifications" },
    { id: "integrations", label: "Integrations" },
  ];

  return (
    <div className="w-full">
      <div className="overflow-x-auto border-b border-slate-700/40">
        <div
          role="tablist"
          className="flex min-w-max gap-1 px-0.5 sm:gap-px"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => onTabChange(t.id)}
              className={cn(
                "border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                tab === t.id
                  ? "border-[#00B4A6] text-white"
                  : "border-transparent text-slate-400 hover:text-slate-300",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8">
        {tab === "business" && <BusinessProfileForm account={account} />}
        {tab === "voice" && <VoiceSettings account={account} />}
        {tab === "notifications" && (
          <NotificationSettings account={account} />
        )}
        {tab === "integrations" && (
          <SettingsIntegrations status={integrationStatus} />
        )}
      </div>
    </div>
  );
}
