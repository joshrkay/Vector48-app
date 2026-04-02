"use client";

import { Plus } from "lucide-react";

import { OpportunityCard } from "@/components/crm/pipeline/OpportunityCard";
import { Button } from "@/components/ui/button";
import { formatCurrency, getStageMetrics, type PipelineGroupedOpportunities } from "@/lib/crm/pipeline";
import { cn } from "@/lib/utils";
import type { GHLPipelineStage } from "@/lib/ghl/types";

interface MobilePipelineViewProps {
  stages: GHLPipelineStage[];
  groupedOpportunities: PipelineGroupedOpportunities;
  selectedStageId: string;
  onSelectStage: (stageId: string) => void;
  onAddOpportunity: (stageId: string) => void;
  onOpenOpportunity: (opportunityId: string) => void;
}

export function MobilePipelineView({
  stages,
  groupedOpportunities,
  selectedStageId,
  onSelectStage,
  onAddOpportunity,
  onOpenOpportunity,
}: MobilePipelineViewProps) {
  const selectedOpportunities = groupedOpportunities[selectedStageId] ?? [];
  const metrics = getStageMetrics(selectedOpportunities);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {stages.map((stage) => {
          const stageMetrics = getStageMetrics(groupedOpportunities[stage.id] ?? []);

          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => onSelectStage(stage.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors",
                selectedStageId === stage.id
                  ? "border-teal-500 bg-teal-50 text-teal-700"
                  : "border-[var(--v48-border)] bg-white text-[var(--text-secondary)]",
              )}
            >
              <span className="font-medium">{stage.name}</span>
              <span className="text-xs">{stageMetrics.count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-[var(--v48-border)] bg-white px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {stages.find((stage) => stage.id === selectedStageId)?.name ?? "Stage"}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            {metrics.count} open • {formatCurrency(metrics.totalValue)}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => onAddOpportunity(selectedStageId)}>
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>

      {selectedOpportunities.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--v48-border)] bg-white px-4 py-10 text-center text-sm text-[var(--text-secondary)]">
          No opportunities in this stage.
        </div>
      ) : (
        <div className="space-y-3">
          {selectedOpportunities.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              opportunity={opportunity}
              onOpen={onOpenOpportunity}
              sortable={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
