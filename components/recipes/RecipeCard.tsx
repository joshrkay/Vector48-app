"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { STAGE_STYLES } from "@/lib/recipes/stages";
import type { RecipeWithStatus } from "@/lib/recipes/types";
import type { AccountProfileSlice } from "@/lib/recipes/activationValidator";
import type { Vertical } from "@/types/recipes";
import { RecipeStageTag } from "./RecipeStageTag";
import { ActivationSheet } from "./ActivationSheet";
import { getRecipeLucideIcon } from "./recipeIcons";
import { Button } from "@/components/ui/button";
import { Clock, TrendingUp } from "lucide-react";
import type { RecipeStatus } from "@/lib/recipes/types";

const STATUS_LABELS: Record<RecipeStatus, string> = {
  active: "Active",
  paused: "Paused",
  error: "Needs attention",
  available: "Available",
  coming_soon: "Coming soon",
};

const STAGE_RAIL: Record<string, string> = {
  awareness: "bg-sky-500",
  capture: "bg-teal-500",
  engage: "bg-violet-500",
  close: "bg-amber-500",
  deliver: "bg-green-500",
  retain: "bg-rose-500",
  reactivate: "bg-orange-500",
};

function formatLastTriggered(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "Recently";

  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  const sixMonthsMs = 180 * 24 * 60 * 60_000;
  const opts: Intl.DateTimeFormatOptions =
    diffMs > sixMonthsMs
      ? { month: "short", day: "numeric", year: "numeric" }
      : { month: "short", day: "numeric" };
  return date.toLocaleDateString("en-US", opts);
}

export interface RecipeCardProps {
  recipe: RecipeWithStatus;
  profile: AccountProfileSlice | null;
  connectedProviders: string[];
  accountVertical?: Vertical | null;
}

export function RecipeCard({
  recipe,
  profile,
  connectedProviders,
  accountVertical,
}: RecipeCardProps) {
  const [activateOpen, setActivateOpen] = useState(false);
  const Icon = getRecipeLucideIcon(recipe.icon);
  const stageStyle = STAGE_STYLES[recipe.funnelStage];
  const isActive = recipe.status === "active";
  const isPaused = recipe.status === "paused";
  const isError = recipe.status === "error";
  const isComingSoon = recipe.status === "coming_soon";

  return (
    <>
      <div
        className={cn(
          "group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm",
          "transition-all duration-150 ease-out",
          !isComingSoon && "hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg",
          "min-h-[260px]",
          isComingSoon && "opacity-60",
        )}
      >
        {/* Stage rail — Monday-style left edge */}
        <div
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 w-1",
            STAGE_RAIL[recipe.funnelStage] ?? "bg-slate-300",
          )}
        />

        <div className="flex flex-1 flex-col gap-4 p-5 pl-6">
          {/* Header row — icon + status */}
          <div className="flex items-start justify-between gap-3">
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                stageStyle.bg,
              )}
            >
              <Icon
                className={cn("h-5 w-5", stageStyle.icon)}
                strokeWidth={1.75}
              />
            </div>

            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
                isActive && "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
                isPaused && "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20",
                isError && "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20",
                recipe.status === "available" &&
                  "bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-200",
                isComingSoon &&
                  "bg-slate-50 text-slate-400 ring-1 ring-inset ring-slate-200",
              )}
            >
              {isActive && (
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                />
              )}
              {STATUS_LABELS[recipe.status]}
            </span>
          </div>

          {/* Title + description */}
          <div>
            <h3 className="font-heading text-[17px] font-semibold leading-snug tracking-[-0.01em] text-slate-900">
              {recipe.name}
            </h3>
            <p className="mt-1.5 line-clamp-3 text-[14px] leading-[1.55] text-slate-600">
              {recipe.description}
            </p>
          </div>

          {/* Stage + outcome metric */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <RecipeStageTag stage={recipe.funnelStage} />
            {recipe.outcomeMetric && (
              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-700">
                <TrendingUp
                  className="h-3.5 w-3.5 text-slate-400"
                  strokeWidth={2}
                />
                {recipe.outcomeMetric}
              </span>
            )}
          </div>

          {/* Meta strip — trigger / sends */}
          <dl className="mt-auto space-y-1 border-t border-slate-100 pt-3 text-[12px] leading-snug">
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 font-medium uppercase tracking-wide text-slate-400">
                Trigger
              </dt>
              <dd className="line-clamp-2 text-slate-600">{recipe.trigger}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 font-medium uppercase tracking-wide text-slate-400">
                Sends
              </dt>
              <dd className="line-clamp-2 text-slate-600">{recipe.output}</dd>
            </div>
          </dl>

          {isActive && recipe.lastTriggeredAt && (
            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              <Clock className="h-3 w-3" strokeWidth={2} />
              <span>Last run {formatLastTriggered(recipe.lastTriggeredAt)}</span>
            </div>
          )}

          {/* Action */}
          <div>
            {isActive && (
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link href={`/dashboard?recipe=${recipe.slug}`}>
                  View activity
                </Link>
              </Button>
            )}
            {isPaused && (
              <Button variant="outline" size="sm" className="w-full">
                Resume
              </Button>
            )}
            {isError && (
              <Button
                variant="outline"
                size="sm"
                className="w-full border-red-200 text-red-700 hover:bg-red-50"
                onClick={() => setActivateOpen(true)}
              >
                Retry setup
              </Button>
            )}
            {recipe.status === "available" && (
              <Button
                size="sm"
                className="w-full bg-slate-900 text-white hover:bg-slate-800"
                onClick={() => setActivateOpen(true)}
              >
                Activate
              </Button>
            )}
            {isComingSoon && (
              <Button
                size="sm"
                variant="outline"
                className="w-full cursor-not-allowed text-slate-400"
                disabled
              >
                Coming soon
              </Button>
            )}
          </div>
        </div>
      </div>

      <ActivationSheet
        open={activateOpen}
        onOpenChange={setActivateOpen}
        recipe={recipe}
        profile={profile}
        connectedProviders={connectedProviders}
        accountVertical={accountVertical}
      />
    </>
  );
}
