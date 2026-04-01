"use client";

import { useEffect, useState } from "react";

type GHLSummaryResponse = {
  openLeads: number;
  conversationsToday: number;
  totalContacts: number;
  unreadInbox: number;
  isStub: boolean;
  cachedAt: string;
};

const FALLBACK_SUMMARY: GHLSummaryResponse = {
  openLeads: 0,
  conversationsToday: 0,
  totalContacts: 0,
  unreadInbox: 0,
  isStub: true,
  cachedAt: new Date().toISOString(),
};

const TILES: Array<{
  key: keyof Omit<GHLSummaryResponse, "isStub" | "cachedAt">;
  label: string;
  subtext: string;
}> = [
  { key: "openLeads", label: "Open Leads", subtext: "in your pipeline" },
  {
    key: "conversationsToday",
    label: "Conversations Today",
    subtext: "messages handled",
  },
  { key: "totalContacts", label: "Total Contacts", subtext: "in your CRM" },
  { key: "unreadInbox", label: "Unread Inbox", subtext: "need a reply" },
];

function getLastSyncedLabel(cachedAt: string): string {
  const date = new Date(cachedAt);
  if (Number.isNaN(date.getTime())) return "Last synced --";

  const diffMinutes = Math.max(
    0,
    Math.round((Date.now() - date.getTime()) / 60_000),
  );

  if (diffMinutes < 1) return "Last synced just now";
  if (diffMinutes === 1) return "Last synced 1 minute ago";

  return `Last synced ${diffMinutes} minutes ago`;
}

export function GHLSummary() {
  const [summary, setSummary] = useState<GHLSummaryResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSummary() {
      try {
        const response = await fetch("/api/ghl/summary", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }

        const payload = (await response.json()) as GHLSummaryResponse;
        setSummary(payload);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("[dashboard] failed to load GHL summary", error);
        setSummary(FALLBACK_SUMMARY);
      }
    }

    void loadSummary();

    return () => controller.abort();
  }, []);

  return (
    <section className="mt-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {TILES.map((tile) => {
          const value = summary?.[tile.key] ?? 0;
          const isUnreadDanger = tile.key === "unreadInbox" && value > 0;

          return (
            <div
              key={tile.key}
              className="rounded-2xl border border-[#E2E8F0] bg-white p-5"
            >
              <div className="flex items-center gap-2">
                <p className="text-[12px] uppercase tracking-wide text-[#64748B]">
                  {tile.label}
                </p>
                {summary?.isStub ? (
                  <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[10px] text-[#64748B]">
                    (sample)
                  </span>
                ) : null}
              </div>

              {summary ? (
                <p
                  className={`mt-2 font-heading text-[28px] font-bold ${
                    isUnreadDanger ? "text-[#EF4444]" : "text-[#0F1923]"
                  }`}
                >
                  {value}
                </p>
              ) : (
                <div className="mt-3 h-9 w-16 animate-pulse rounded-md bg-gray-100" />
              )}

              <p className="mt-1 text-[11px] text-[#64748B]">{tile.subtext}</p>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-[#64748B]">
        {summary ? getLastSyncedLabel(summary.cachedAt) : "Last synced --"}
      </p>
    </section>
  );
}
