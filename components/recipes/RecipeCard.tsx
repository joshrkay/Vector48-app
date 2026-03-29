"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { STAGE_STYLES } from "@/lib/recipes/stages";
import type { RecipeWithStatus } from "@/lib/recipes/types";
import { RecipeStageTag } from "./RecipeStageTag";
import { Button } from "@/components/ui/button";
import {
  Phone,
  MessageSquare,
  FileText,
  Moon,
  Mail,
  ClipboardCheck,
  RefreshCw,
  CalendarCheck,
  CalendarClock,
  Receipt,
  HeartHandshake,
  Wrench,
  Star,
  Megaphone,
  Clock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  phone: Phone,
  "message-square": MessageSquare,
  "file-text": FileText,
  moon: Moon,
  mail: Mail,
  "clipboard-check": ClipboardCheck,
  "refresh-cw": RefreshCw,
  "calendar-check": CalendarCheck,
  "calendar-clock": CalendarClock,
  receipt: Receipt,
  "heart-handshake": HeartHandshake,
  wrench: Wrench,
  star: Star,
  megaphone: Megaphone,
};

function formatLastTriggered(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RecipeCard({ recipe }: { recipe: RecipeWithStatus }) {
  const Icon = ICON_MAP[recipe.icon];
  const stageStyle = STAGE_STYLES[recipe.funnelStage];
  const isActive = recipe.status === "active";
  const isComingSoon = recipe.status === "coming_soon";

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border border-[var(--v48-border)] bg-white shadow-sm transition-shadow hover:shadow-md",
        "md:min-h-[280px]",
        isActive && "border-t-4 border-t-[var(--v48-accent)]",
        isComingSoon && "opacity-50",
      )}
    >
      <div className="flex flex-1 flex-col p-5">
        {/* Icon + Status badge row */}
        <div className="flex items-start justify-between">
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-xl",
              stageStyle.bg,
            )}
          >
            {Icon && (
              <Icon className={cn("h-6 w-6", stageStyle.icon)} strokeWidth={1.5} />
            )}
          </div>

          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
              isActive && "bg-[var(--v48-accent)] text-white",
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
            {isActive ? "Active" : recipe.status === "available" ? "Available" : "Coming Soon"}
          </span>
        </div>

        {/* Name */}
        <h3 className="mt-4 font-heading text-lg font-semibold leading-tight">
          {recipe.name}
        </h3>

        {/* Description */}
        <p className="mt-1.5 line-clamp-2 text-sm text-[var(--text-secondary)]">
          {recipe.description}
        </p>

        {/* Stage tag */}
        <div className="mt-3">
          <RecipeStageTag stage={recipe.funnelStage} />
        </div>

        {/* Last triggered (active only) */}
        {isActive && recipe.lastTriggeredAt && (
          <div className="mt-2 flex items-center gap-1 text-xs text-[var(--text-secondary)]">
            <Clock className="h-3 w-3" />
            <span>Last triggered {formatLastTriggered(recipe.lastTriggeredAt)}</span>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* CTA */}
        <div className="mt-4">
          {isActive && (
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link href={`/dashboard?recipe=${recipe.slug}`}>View Activity</Link>
            </Button>
          )}
          {recipe.status === "available" && (
            <Button
              size="sm"
              className="w-full bg-[var(--v48-accent)] text-white hover:bg-[var(--v48-accent)]/90"
            >
              Activate
            </Button>
          )}
          {/* Coming Soon: no button */}
        </div>
      </div>
    </div>
  );
}
