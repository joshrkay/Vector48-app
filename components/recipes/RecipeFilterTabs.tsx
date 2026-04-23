"use client";

import { cn } from "@/lib/utils";

type FilterValue = "all" | "active";

interface RecipeFilterTabsProps {
  value: FilterValue;
  onChange: (value: FilterValue) => void;
  activeCount: number;
}

export function RecipeFilterTabs({
  value,
  onChange,
  activeCount,
}: RecipeFilterTabsProps) {
  const tabs: { key: FilterValue; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: `Active (${activeCount})` },
  ];

  return (
    <div
      role="tablist"
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm"
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={value === tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            value === tab.key
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
