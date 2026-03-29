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
      className="inline-flex items-center gap-1 rounded-full bg-gray-100 p-1"
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={value === tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-all",
            value === tab.key
              ? "bg-white text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
