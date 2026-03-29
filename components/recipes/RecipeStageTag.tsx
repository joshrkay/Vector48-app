import { cn } from "@/lib/utils";
import { STAGE_STYLES } from "@/lib/recipes/stages";
import type { FunnelStage } from "@/lib/recipes/types";

const STAGE_LABELS: Record<FunnelStage, string> = {
  awareness: "Awareness",
  capture: "Capture",
  nurture: "Nurture",
  close: "Close",
  delight: "Delight",
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
