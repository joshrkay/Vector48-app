"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccountProfileSlice } from "@/lib/recipes/activationValidator";
import type { RecipeWithStatus } from "@/lib/recipes/types";
import type { FunnelStage, Vertical } from "@/types/recipes";
import { FUNNEL_STAGE_META } from "@/types/recipes";
import { RecipeFilterTabs } from "./RecipeFilterTabs";
import { RecipeCard } from "./RecipeCard";

const STAGE_ORDER: FunnelStage[] = [
  "awareness",
  "capture",
  "engage",
  "close",
  "deliver",
  "retain",
  "reactivate",
];

const STAGE_CHIP_COLOR: Record<FunnelStage, string> = {
  awareness: "bg-sky-500",
  capture: "bg-teal-500",
  engage: "bg-violet-500",
  close: "bg-amber-500",
  deliver: "bg-green-500",
  retain: "bg-rose-500",
  reactivate: "bg-orange-500",
};

type StageFilter = FunnelStage | "all";

export function RecipeGrid({
  recipes,
  activeCount,
  profile,
  connectedProviders,
  accountVertical,
}: {
  recipes: RecipeWithStatus[];
  activeCount: number;
  profile: AccountProfileSlice | null;
  connectedProviders: string[];
  accountVertical?: Vertical | null;
}) {
  const [filter, setFilter] = useState<"all" | "active">("all");
  const [stage, setStage] = useState<StageFilter>("all");

  const stageCounts = useMemo(() => {
    const counts = new Map<FunnelStage, number>();
    for (const r of recipes) {
      counts.set(r.funnelStage, (counts.get(r.funnelStage) ?? 0) + 1);
    }
    return counts;
  }, [recipes]);

  const filtered = useMemo(() => {
    let rows = recipes;
    if (filter === "active") rows = rows.filter((r) => r.status === "active");
    if (stage !== "all") rows = rows.filter((r) => r.funnelStage === stage);
    return rows;
  }, [recipes, filter, stage]);

  return (
    <div>
      {/* Primary filter row — All vs Active */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <RecipeFilterTabs
          value={filter}
          onChange={setFilter}
          activeCount={activeCount}
        />
      </div>

      {/* Stage filter chip strip */}
      <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1">
        <StageChip
          label="All stages"
          active={stage === "all"}
          onClick={() => setStage("all")}
          color="bg-slate-400"
          count={recipes.length}
        />
        {STAGE_ORDER.map((s) => {
          const count = stageCounts.get(s) ?? 0;
          if (count === 0) return null;
          return (
            <StageChip
              key={s}
              label={FUNNEL_STAGE_META[s].label}
              active={stage === s}
              onClick={() => setStage(s)}
              color={STAGE_CHIP_COLOR[s]}
              count={count}
            />
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          onReset={() => {
            setFilter("all");
            setStage("all");
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((recipe) => (
            <RecipeCard
              key={recipe.slug}
              recipe={recipe}
              profile={profile}
              connectedProviders={connectedProviders}
              accountVertical={accountVertical}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StageChip({
  label,
  count,
  active,
  onClick,
  color,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      <span
        aria-hidden
        className={cn("h-2 w-2 rounded-full", color, active && "opacity-80")}
      />
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-[11px] tabular-nums",
          active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
        <Sparkles className="h-5 w-5 text-slate-400" strokeWidth={1.75} />
      </div>
      <p className="text-[15px] font-medium text-slate-700">
        Nothing matches these filters yet.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="text-sm font-medium text-slate-900 underline underline-offset-4 hover:text-slate-700"
      >
        Reset filters
      </button>
    </div>
  );
}
