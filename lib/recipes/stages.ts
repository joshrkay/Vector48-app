import type { FunnelStage } from "./types";

export interface StageStyle {
  /** Background for icon tile and tag pill */
  bg: string;
  /** Text color for tag pill */
  text: string;
  /** Icon color inside the tile */
  icon: string;
}

export const STAGE_STYLES: Record<FunnelStage, StageStyle> = {
  awareness: { bg: "bg-blue-50", text: "text-blue-600", icon: "text-blue-500" },
  capture: { bg: "bg-teal-50", text: "text-teal-600", icon: "text-teal-500" },
  nurture: { bg: "bg-amber-50", text: "text-amber-600", icon: "text-amber-500" },
  close: { bg: "bg-green-50", text: "text-green-600", icon: "text-green-500" },
  delight: { bg: "bg-purple-50", text: "text-purple-600", icon: "text-purple-500" },
  engage: { bg: "bg-violet-50", text: "text-violet-600", icon: "text-violet-500" },
  deliver: { bg: "bg-emerald-50", text: "text-emerald-600", icon: "text-emerald-500" },
  retain: { bg: "bg-rose-50", text: "text-rose-600", icon: "text-rose-500" },
  reactivate: { bg: "bg-orange-50", text: "text-orange-600", icon: "text-orange-500" },
};
