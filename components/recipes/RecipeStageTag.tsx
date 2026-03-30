import { cn } from "@/lib/utils";
import { STAGE_STYLES } from "@/lib/recipes/stages";
import type { FunnelStage } from "@/types/recipes";
<<<<<<< Current (Your changes)

const STAGE_LABELS: Record<FunnelStage, string> = {
  awareness: "Awareness",
  capture: "Capture",
  engage: "Engage",
  close: "Close",
  deliver: "Deliver",
  retain: "Retain",
  reactivate: "Reactivate",
};
=======
import { FUNNEL_STAGE_META } from "@/types/recipes";
>>>>>>> Incoming (Background Agent changes)

export function RecipeStageTag({ stage }: { stage: FunnelStage }) {
  const style = STAGE_STYLES[stage];
  const label = FUNNEL_STAGE_META[stage]?.label ?? stage;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        style.bg,
        style.text,
      )}
    >
      {label}
    </span>
  );
}
