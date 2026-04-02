"use client";

import { useRef, useState } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { toast } from "sonner";

import { AddOpportunitySheet } from "@/components/crm/pipeline/AddOpportunitySheet";
import { MobilePipelineView } from "@/components/crm/pipeline/MobilePipelineView";
import { OpportunityCard } from "@/components/crm/pipeline/OpportunityCard";
import { OpportunityDetailSheet } from "@/components/crm/pipeline/OpportunityDetailSheet";
import { PipelineColumn } from "@/components/crm/pipeline/PipelineColumn";
import {
  findOpportunityBoardLocation,
  findOpportunityInBoard,
  formatCurrency,
  getPipelineMetrics,
  getStageMetrics,
  groupOpportunitiesByPipeline,
  moveOpportunityInBoard,
  removeOpportunityFromBoard,
  upsertOpportunityInBoard,
  type PipelineBoardGroups,
  type PipelineOpportunitySummary,
} from "@/lib/crm/pipeline";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import type { GHLPipeline } from "@/lib/ghl/types";

interface PipelineBoardProps {
  pipelines: GHLPipeline[];
  initialOpportunities: PipelineOpportunitySummary[];
}

interface AddSheetState {
  pipelineId: string;
  stageId: string;
}

function getInitialSelectedStages(pipelines: GHLPipeline[]) {
  return Object.fromEntries(
    pipelines.map((pipeline) => [pipeline.id, pipeline.stages[0]?.id ?? ""]),
  ) as Record<string, string>;
}

function resolveDropTarget(event: DragEndEvent) {
  const overData = event.over?.data.current;

  if (overData?.type === "stage") {
    return {
      pipelineId: String(overData.pipelineId),
      stageId: String(overData.stageId),
    };
  }

  if (overData?.type === "opportunity") {
    return {
      pipelineId: String(overData.pipelineId),
      stageId: String(overData.stageId),
    };
  }

  return null;
}

export function PipelineBoard({
  pipelines,
  initialOpportunities,
}: PipelineBoardProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [board, setBoard] = useState<PipelineBoardGroups>(() =>
    groupOpportunitiesByPipeline(pipelines, initialOpportunities),
  );
  const [activeOpportunityId, setActiveOpportunityId] = useState<string | null>(null);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [closingSnapshot, setClosingSnapshot] = useState<PipelineOpportunitySummary | null>(null);
  const [addSheetState, setAddSheetState] = useState<AddSheetState | null>(null);
  const [mobileSelectedStages, setMobileSelectedStages] = useState<Record<string, string>>(
    () => getInitialSelectedStages(pipelines),
  );

  const boardRef = useRef(board);
  boardRef.current = board;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const activeOpportunity = activeOpportunityId
    ? findOpportunityInBoard(board, activeOpportunityId)
    : null;

  const selectedOpportunity = selectedOpportunityId
    ? findOpportunityInBoard(board, selectedOpportunityId) ??
      (closingSnapshot?.id === selectedOpportunityId ? closingSnapshot : null)
    : null;

  const selectedStages = selectedOpportunity
    ? pipelines.find((pipeline) => pipeline.id === selectedOpportunity.pipelineId)?.stages ?? []
    : [];

  async function moveOpportunity(
    opportunityId: string,
    destinationStageId: string,
  ): Promise<boolean> {
    const previousBoard = boardRef.current;
    const location = findOpportunityBoardLocation(previousBoard, opportunityId);

    if (!location || location.stageId === destinationStageId) {
      return true;
    }

    const nextState = moveOpportunityInBoard(
      previousBoard,
      opportunityId,
      destinationStageId,
    );

    if (!nextState.moved) {
      return false;
    }

    setBoard(nextState.next);

    try {
      const response = await fetch(`/api/ghl/opportunities/${opportunityId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pipelineStageId: destinationStageId }),
      });

      if (!response.ok) {
        throw new Error("Failed to update stage");
      }

      return true;
    } catch {
      setBoard(previousBoard);
      toast.error("Failed to update stage");
      return false;
    }
  }

  async function closeOpportunity(
    opportunityId: string,
    status: "won" | "lost",
  ): Promise<boolean> {
    const previousBoard = boardRef.current;
    const removed = removeOpportunityFromBoard(previousBoard, opportunityId);

    if (!removed.removed) {
      return false;
    }

    if (selectedOpportunityId === opportunityId) {
      setClosingSnapshot(removed.removed);
    }

    setBoard(removed.next);

    try {
      const response = await fetch(`/api/ghl/opportunities/${opportunityId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error("Failed to update status");
      }

      return true;
    } catch {
      setBoard(previousBoard);
      setClosingSnapshot(null);
      toast.error(`Failed to close opportunity as ${status}`);
      return false;
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveOpportunityId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveOpportunityId(null);

    const opportunityId = String(event.active.id);
    const source = findOpportunityBoardLocation(boardRef.current, opportunityId);
    const target = resolveDropTarget(event);

    if (!source || !target || source.pipelineId !== target.pipelineId) {
      return;
    }

    if (source.stageId === target.stageId) {
      return;
    }

    void moveOpportunity(opportunityId, target.stageId);
  }

  function openAddOpportunity(pipelineId: string, stageId: string) {
    setAddSheetState({ pipelineId, stageId });
  }

  function handleOpportunityCreated(opportunity: PipelineOpportunitySummary) {
    setBoard((current) => upsertOpportunityInBoard(current, opportunity));
  }

  function handleDetailOpenChange(open: boolean) {
    if (!open) {
      setSelectedOpportunityId(null);
      setClosingSnapshot(null);
    }
  }

  if (pipelines.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--v48-border)] bg-white px-5 py-10 text-center text-sm text-[var(--text-secondary)]">
        No pipelines available in GoHighLevel yet.
      </div>
    );
  }

  return (
    <>
      {isDesktop ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveOpportunityId(null)}
        >
          <div className="space-y-8">
            {pipelines.map((pipeline) => {
              const grouped =
                board[pipeline.id] ??
                groupOpportunitiesByPipeline([pipeline], [])[pipeline.id];
              const pipelineMetrics = getPipelineMetrics(grouped, pipeline.stages);

              return (
                <section key={pipeline.id} className="space-y-3">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <h2 className="font-heading text-xl font-semibold text-[var(--text-primary)]">
                        {pipeline.name}
                      </h2>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {pipelineMetrics.count} open opportunities •{" "}
                        {formatCurrency(pipelineMetrics.totalValue)}
                      </p>
                    </div>
                  </div>

                  {pipeline.stages.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--v48-border)] bg-white px-5 py-8 text-sm text-[var(--text-secondary)]">
                      This pipeline has no stages configured.
                    </div>
                  ) : (
                    <div className="overflow-x-auto pb-2">
                      <div className="flex min-w-max gap-4">
                        {pipeline.stages.map((stage) => {
                          const opportunities = grouped[stage.id] ?? [];
                          const metrics = getStageMetrics(opportunities);

                          return (
                            <PipelineColumn
                              key={stage.id}
                              pipelineId={pipeline.id}
                              stage={stage}
                              count={metrics.count}
                              totalValue={metrics.totalValue}
                              onAddOpportunity={(stageId) =>
                                openAddOpportunity(pipeline.id, stageId)
                              }
                            >
                              <SortableContext
                                items={opportunities.map((opportunity) => opportunity.id)}
                                strategy={verticalListSortingStrategy}
                              >
                                {opportunities.length === 0 ? (
                                  <div className="rounded-xl border border-dashed border-[var(--v48-border)] bg-white px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                                    Drop here or add a new opportunity.
                                  </div>
                                ) : (
                                  opportunities.map((opportunity) => (
                                    <OpportunityCard
                                      key={opportunity.id}
                                      opportunity={opportunity}
                                      onOpen={setSelectedOpportunityId}
                                    />
                                  ))
                                )}
                              </SortableContext>
                            </PipelineColumn>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          <DragOverlay>
            {activeOpportunity ? (
              <div className="w-[290px]">
                <OpportunityCard
                  opportunity={activeOpportunity}
                  onOpen={() => undefined}
                  sortable={false}
                  dragging
                  interactive={false}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="space-y-8">
          {pipelines.map((pipeline) => {
            const grouped =
              board[pipeline.id] ?? groupOpportunitiesByPipeline([pipeline], [])[pipeline.id];
            const selectedStageId =
              mobileSelectedStages[pipeline.id] || pipeline.stages[0]?.id || "";
            const pipelineMetrics = getPipelineMetrics(grouped, pipeline.stages);

            return (
              <section key={pipeline.id} className="space-y-3">
                <div>
                  <h2 className="font-heading text-xl font-semibold text-[var(--text-primary)]">
                    {pipeline.name}
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {pipelineMetrics.count} open opportunities •{" "}
                    {formatCurrency(pipelineMetrics.totalValue)}
                  </p>
                </div>

                {pipeline.stages.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[var(--v48-border)] bg-white px-5 py-8 text-sm text-[var(--text-secondary)]">
                    This pipeline has no stages configured.
                  </div>
                ) : (
                  <MobilePipelineView
                    stages={pipeline.stages}
                    groupedOpportunities={grouped}
                    selectedStageId={selectedStageId}
                    onSelectStage={(stageId) =>
                      setMobileSelectedStages((current) => ({
                        ...current,
                        [pipeline.id]: stageId,
                      }))
                    }
                    onAddOpportunity={(stageId) =>
                      openAddOpportunity(pipeline.id, stageId)
                    }
                    onOpenOpportunity={setSelectedOpportunityId}
                  />
                )}
              </section>
            );
          })}
        </div>
      )}

      <OpportunityDetailSheet
        open={selectedOpportunity !== null}
        opportunity={selectedOpportunity}
        stages={selectedStages}
        onOpenChange={handleDetailOpenChange}
        onMoveStage={moveOpportunity}
        onCloseStatus={closeOpportunity}
      />

      <AddOpportunitySheet
        open={addSheetState !== null}
        pipelineId={addSheetState?.pipelineId ?? pipelines[0]?.id ?? ""}
        stages={
          pipelines.find((pipeline) => pipeline.id === addSheetState?.pipelineId)?.stages ?? []
        }
        initialStageId={addSheetState?.stageId ?? ""}
        onOpenChange={(open) => {
          if (!open) {
            setAddSheetState(null);
          }
        }}
        onCreated={handleOpportunityCreated}
      />
    </>
  );
}
