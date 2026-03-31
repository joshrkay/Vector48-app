import { cn } from "@/lib/utils";
import { STAGE_STYLES } from "@/lib/recipes/stages";
import type { FunnelStage } from "@/types/recipes";
import { FUNNEL_STAGE_META } from "@/types/recipes";

const STAGE_LABELS: Record<FunnelStage, string> = Object.fromEntries(
  (Object.keys(FUNNEL_STAGE_META) as FunnelStage[]).map((k) => [k, FUNNEL_STAGE_META[k].label]),
) as Record<FunnelStage, string>;

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
      {FUNNEL_STAGE_META[stage].label}
    </span>
  );
}
