"use client";

import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/crm/pipeline";
import { cn } from "@/lib/utils";
import type { GHLPipelineStage } from "@/lib/ghl/types";

interface PipelineColumnProps {
  pipelineId: string;
  stage: GHLPipelineStage;
  count: number;
  totalValue: number;
  droppable?: boolean;
  onAddOpportunity: (stageId: string) => void;
  children: React.ReactNode;
}

export function PipelineColumn({
  pipelineId,
  stage,
  count,
  totalValue,
  droppable = true,
  onAddOpportunity,
  children,
}: PipelineColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `stage:${pipelineId}:${stage.id}`,
    disabled: !droppable,
    data: {
      type: "stage",
      pipelineId,
      stageId: stage.id,
    },
  });

  return (
    <section className="flex h-full min-w-[290px] max-w-[290px] flex-col rounded-2xl border border-[var(--v48-border)] bg-[var(--bg-secondary)]">
      <header className="flex items-start justify-between gap-3 border-b border-[var(--v48-border)] px-4 py-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            {stage.name}
          </h2>
          <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
            <span>{count} {count === 1 ? "opportunity" : "opportunities"}</span>
            <span>{formatCurrency(totalValue)}</span>
          </div>
        </div>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          onClick={() => onAddOpportunity(stage.id)}
          aria-label={`Add opportunity to ${stage.name}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[360px] flex-1 flex-col gap-3 overflow-y-auto px-3 py-3",
          isOver && "bg-teal-50/70",
        )}
      >
        {children}
      </div>
    </section>
  );
}
