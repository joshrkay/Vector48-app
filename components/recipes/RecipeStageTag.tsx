import { cn } from "@/lib/utils";
import { STAGE_STYLES } from "@/lib/recipes/stages";
import type { FunnelStage } from "@/types/recipes";

const STAGE_LABELS: Record<FunnelStage, string> = {
  awareness: "Awareness",
  capture: "Capture",
  engage: "Engage",
  close: "Close",
  deliver: "Deliver",
  retain: "Retain",
  reactivate: "Reactivate",
};

export function RecipeStageTag({ stage }: { stage: FunnelStage }) {
  const style = STAGE_STYLES[stage];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        style.bg,
        style.text,
      )}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}
