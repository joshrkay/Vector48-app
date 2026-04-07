"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { GHLCampaign } from "@/lib/ghl/types";

type FilterTab = "all" | "published" | "draft" | "archived";

const TABS: { value: FilterTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  published: { bg: "bg-emerald-100", text: "text-emerald-800" },
  draft: { bg: "bg-amber-100", text: "text-amber-800" },
  archived: { bg: "bg-gray-100", text: "text-gray-600" },
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface Props {
  campaigns: GHLCampaign[];
}

export function CampaignList({ campaigns }: Props) {
  const [filter, setFilter] = useState<FilterTab>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return campaigns;
    return campaigns.filter((c) => c.status === filter);
  }, [campaigns, filter]);

  const counts = useMemo(() => {
    const c = { all: campaigns.length, published: 0, draft: 0, archived: 0 };
    for (const campaign of campaigns) {
      if (campaign.status === "published") c.published++;
      else if (campaign.status === "draft") c.draft++;
      else if (campaign.status === "archived") c.archived++;
    }
    return c;
  }, [campaigns]);

  if (campaigns.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          No campaigns found. Create campaigns in GoHighLevel to see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg border bg-white p-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setFilter(tab.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              filter === tab.value
                ? "bg-[var(--v48-accent)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            {tab.label} ({counts[tab.value]})
          </button>
        ))}
      </div>

      {/* Campaign list */}
      <div className="divide-y rounded-xl border bg-white">
        {filtered.map((campaign) => {
          const style = STATUS_STYLES[campaign.status] ?? STATUS_STYLES.draft;
          return (
            <div
              key={campaign.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {campaign.name}
                </p>
                {campaign.type && (
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    {campaign.type}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="hidden text-xs text-[var(--text-secondary)] sm:inline">
                  {formatDate(campaign.dateUpdated ?? campaign.dateAdded)}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    style.bg,
                    style.text,
                  )}
                >
                  {campaign.status}
                </span>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
            No {filter} campaigns.
          </div>
        )}
      </div>
    </div>
  );
}
