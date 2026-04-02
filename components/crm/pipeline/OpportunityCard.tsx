"use client";

import { useSortable } from "@dnd-kit/sortable";

import { formatCurrency, getDaysInStage, type PipelineOpportunitySummary } from "@/lib/crm/pipeline";
import { cn } from "@/lib/utils";

interface OpportunityCardProps {
  opportunity: PipelineOpportunitySummary;
  onOpen: (opportunityId: string) => void;
  sortable?: boolean;
  dragging?: boolean;
  disabled?: boolean;
  interactive?: boolean;
}

function cardTransform(
  transform: { x: number; y: number; scaleX: number; scaleY: number } | null,
) {
  if (!transform) return undefined;

  return `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`;
}

function OpportunityCardBody({
  opportunity,
  dragging = false,
}: Pick<OpportunityCardProps, "opportunity" | "dragging">) {
  const daysInStage = getDaysInStage(opportunity);

  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--v48-border)] bg-white p-4 text-left shadow-sm transition-shadow",
        dragging && "shadow-lg",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {opportunity.contactName}
          </p>
          <p className="truncate text-sm text-[var(--text-secondary)]">
            {opportunity.jobType}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {opportunity.recipeSlugs.length > 0 ? (
            <span
              className="inline-flex h-2.5 w-2.5 rounded-full bg-teal-500"
              title={opportunity.recipeSlugs.join(", ")}
              aria-label="Active recipe"
            />
          ) : null}
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {daysInStage}d
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-[var(--text-primary)]">
          {formatCurrency(opportunity.monetaryValue)}
        </span>
        <span className="text-[var(--text-secondary)]">
          {daysInStage === 1 ? "1 day in stage" : `${daysInStage} days in stage`}
        </span>
      </div>
    </div>
  );
}

export function OpportunityCard({
  opportunity,
  onOpen,
  sortable = true,
  dragging = false,
  disabled = false,
  interactive = true,
}: OpportunityCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: opportunity.id,
    disabled: !sortable || disabled,
    data: {
      type: "opportunity",
      opportunityId: opportunity.id,
      pipelineId: opportunity.pipelineId,
      stageId: opportunity.stageId,
    },
  });

  const card = (
    <OpportunityCardBody
      opportunity={opportunity}
      dragging={dragging || isDragging}
    />
  );

  if (!sortable && !interactive) {
    return card;
  }

  if (!sortable) {
    return (
      <button type="button" className="w-full" onClick={() => onOpen(opportunity.id)}>
        {card}
      </button>
    );
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={cn("w-full", isDragging && "opacity-40")}
      style={{
        transform: cardTransform(transform),
        transition,
      }}
      onClick={() => onOpen(opportunity.id)}
      {...attributes}
      {...listeners}
    >
      {card}
    </button>
  );
}
