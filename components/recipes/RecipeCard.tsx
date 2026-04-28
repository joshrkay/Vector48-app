"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGE_STYLES } from "@/lib/recipes/stages";
import type { AccountProfileSlice } from "@/lib/recipes/activationValidator";
import type { RecipeStatus, RecipeWithStatus } from "@/lib/recipes/types";
import { Button } from "@/components/ui/button";
import { RecipeStageTag } from "./RecipeStageTag";
import { ActivationSheet } from "./ActivationSheet";
import { getRecipeLucideIcon } from "./recipeIcons";

const STATUS_LABELS: Record<RecipeStatus, string> = {
  active: "Active",
  paused: "Paused",
  error: "Error",
  available: "Available",
  coming_soon: "Coming Soon",
};

const ENGINE_LABELS: Record<RecipeWithStatus["engine"], string> = {
  "agent-sdk": "Agent SDK",
  n8n: "n8n",
  "ghl-native": "GHL Native",
};

const ACTIVATION_STATE_LABELS: Record<RecipeWithStatus["activationState"], string> = {
  fully_launchable: "Launchable",
  gated: "Gated",
  legacy_engine_only: "Legacy Engine",
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
}

export function RecipeCard({
  recipe,
  profile,
  connectedProviders,
}: RecipeCardProps) {
  const [activateOpen, setActivateOpen] = useState(false);
  const Icon = getRecipeLucideIcon(recipe.icon);
  const stageStyle = STAGE_STYLES[recipe.funnelStage];
  const isActive = recipe.status === "active";
  const isPaused = recipe.status === "paused";
  const isError = recipe.status === "error";
  const isComingSoon = recipe.status === "coming_soon";
  const isGated = recipe.activationState === "gated";

  return (
    <>
      <div
        className={cn(
          "relative flex flex-col rounded-2xl border border-[var(--v48-border)] bg-white shadow-sm transition-shadow hover:shadow-md",
          "md:min-h-[280px]",
          isActive && "border-t-4 border-t-[var(--v48-accent)]",
          isPaused && "border-t-4 border-t-amber-400",
          isError && "border-t-4 border-t-red-400",
          (isComingSoon || isGated) && "opacity-70",
        )}
      >
        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-start justify-between">
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-xl",
                stageStyle.bg,
              )}
            >
              <Icon className={cn("h-6 w-6", stageStyle.icon)} strokeWidth={1.5} />
            </div>

            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                isActive && "bg-[var(--v48-accent)] text-white",
                isPaused && "bg-amber-100 text-amber-700",
                isError && "bg-red-100 text-red-700",
                recipe.status === "available" && "bg-gray-100 text-gray-600",
                isComingSoon && "bg-gray-50 text-gray-400",
              )}
            >
              {isActive && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
              )}
              {STATUS_LABELS[recipe.status]}
            </span>
          </div>

          <h3 className="mt-4 font-heading text-lg font-semibold leading-tight">
            {recipe.name}
          </h3>

          <p className="mt-1.5 line-clamp-2 text-sm text-[var(--text-secondary)]">
            {recipe.description}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <RecipeStageTag stage={recipe.funnelStage} />
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
              {ENGINE_LABELS[recipe.engine]}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
              {ACTIVATION_STATE_LABELS[recipe.activationState]}
            </span>
          </div>

          {isGated && recipe.gateReason && (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">{recipe.gateReason}</p>
          )}

          {isActive && recipe.lastTriggeredAt && (
            <div className="mt-2 flex items-center gap-1 text-xs text-[var(--text-secondary)]">
              <Clock className="h-3 w-3" />
              <span>Last triggered {formatLastTriggered(recipe.lastTriggeredAt)}</span>
            </div>
          )}

          <div className="flex-1" />

          <div className="mt-4">
            {isActive && (
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link href={`/dashboard?recipe=${recipe.slug}`}>View Activity</Link>
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
                className="w-full"
                onClick={() => setActivateOpen(true)}
              >
                Retry setup
              </Button>
            )}
            {recipe.status === "available" && !isGated && (
              <Button
                size="sm"
                className="w-full bg-[var(--v48-accent)] text-white hover:opacity-90"
                onClick={() => setActivateOpen(true)}
              >
                Activate
              </Button>
            )}
            {recipe.status === "available" && isGated && (
              <Button
                size="sm"
                variant="outline"
                className="w-full cursor-not-allowed text-[var(--text-secondary)]"
                disabled
              >
                Unavailable
              </Button>
            )}
            {isComingSoon && (
              <Button
                size="sm"
                variant="outline"
                className="w-full cursor-not-allowed text-[var(--text-secondary)]"
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
      />
    </>
  );
}
