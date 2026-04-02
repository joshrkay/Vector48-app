import assert from "node:assert/strict";
import test from "node:test";

import {
  findOpportunityBoardLocation,
  findOpportunityInBoard,
  findOpportunityStageId,
  getDaysInStage,
  getPipelineMetrics,
  groupOpportunitiesByPipeline,
  groupOpportunitiesByStage,
  moveOpportunityInBoard,
  moveOpportunityToStage,
  removeOpportunityFromBoard,
  removeOpportunityFromGroups,
  upsertOpportunityInBoard,
  upsertOpportunityInGroups,
  type PipelineOpportunitySummary,
} from "./pipeline.ts";

const stages = [
  { id: "stage-1", name: "New", position: 1 },
  { id: "stage-2", name: "Qualified", position: 2 },
];

const pipelines = [
  { id: "pipeline-1", name: "Sales", stages },
  {
    id: "pipeline-2",
    name: "Installs",
    stages: [
      { id: "stage-3", name: "Scheduled", position: 1 },
      { id: "stage-4", name: "Completed", position: 2 },
    ],
  },
];

function opportunity(
  partial: Partial<PipelineOpportunitySummary> & Pick<PipelineOpportunitySummary, "id">,
): PipelineOpportunitySummary {
  return {
    id: partial.id,
    contactId: partial.contactId ?? `contact-${partial.id}`,
    contactName: partial.contactName ?? "Contact",
    contactPhone: partial.contactPhone ?? null,
    jobType: partial.jobType ?? "Replacement",
    monetaryValue: partial.monetaryValue ?? 1000,
    pipelineId: partial.pipelineId ?? "pipeline-1",
    stageId: partial.stageId ?? "stage-1",
    status: partial.status ?? "open",
    enteredStageAt: partial.enteredStageAt ?? "2026-03-30T00:00:00.000Z",
    dateAdded: partial.dateAdded ?? "2026-03-30T00:00:00.000Z",
    recipeSlugs: partial.recipeSlugs ?? [],
  };
}

test("groups opportunities by stage", () => {
  const grouped = groupOpportunitiesByStage(stages, [
    opportunity({ id: "opp-1", stageId: "stage-1" }),
    opportunity({ id: "opp-2", stageId: "stage-2" }),
  ]);

  assert.equal(grouped["stage-1"].length, 1);
  assert.equal(grouped["stage-2"].length, 1);
});

test("moves an opportunity between stages", () => {
  const grouped = groupOpportunitiesByStage(stages, [
    opportunity({ id: "opp-1", stageId: "stage-1" }),
    opportunity({ id: "opp-2", stageId: "stage-2" }),
  ]);

  const result = moveOpportunityToStage(grouped, "opp-1", "stage-2");

  assert.equal(result.previousStageId, "stage-1");
  assert.equal(result.next["stage-1"].length, 0);
  assert.equal(result.next["stage-2"].some((item) => item.id === "opp-1"), true);
  assert.equal(findOpportunityStageId(result.next, "opp-1"), "stage-2");
});

test("removeOpportunityFromGroups removes the opportunity from every stage", () => {
  const grouped = groupOpportunitiesByStage(stages, [
    opportunity({ id: "opp-1", stageId: "stage-1" }),
    opportunity({ id: "opp-2", stageId: "stage-2" }),
  ]);

  const next = removeOpportunityFromGroups(grouped, "opp-2");

  assert.equal(findOpportunityStageId(next, "opp-2"), null);
});

test("upsertOpportunityInGroups inserts into the correct stage", () => {
  const grouped = groupOpportunitiesByStage(stages, [
    opportunity({ id: "opp-1", stageId: "stage-1" }),
  ]);

  const next = upsertOpportunityInGroups(
    grouped,
    opportunity({ id: "opp-2", stageId: "stage-2" }),
  );

  assert.equal(next["stage-2"][0].id, "opp-2");
});

test("getDaysInStage floors whole days", () => {
  const days = getDaysInStage(
    opportunity({ id: "opp-1", enteredStageAt: "2026-03-28T12:00:00.000Z" }),
    new Date("2026-04-01T12:00:00.000Z").getTime(),
  );

  assert.equal(days, 4);
});

test("groups opportunities by pipeline and stage", () => {
  const board = groupOpportunitiesByPipeline(pipelines, [
    opportunity({ id: "opp-1", pipelineId: "pipeline-1", stageId: "stage-1" }),
    opportunity({ id: "opp-2", pipelineId: "pipeline-2", stageId: "stage-3" }),
  ]);

  assert.equal(board["pipeline-1"]["stage-1"].length, 1);
  assert.equal(board["pipeline-2"]["stage-3"].length, 1);
  assert.equal(board["pipeline-1"]["stage-2"].length, 0);
});

test("moves an opportunity within its pipeline board", () => {
  const board = groupOpportunitiesByPipeline(pipelines, [
    opportunity({ id: "opp-1", pipelineId: "pipeline-1", stageId: "stage-1" }),
    opportunity({ id: "opp-2", pipelineId: "pipeline-2", stageId: "stage-3" }),
  ]);

  const result = moveOpportunityInBoard(board, "opp-1", "stage-2");

  assert.equal(result.pipelineId, "pipeline-1");
  assert.equal(findOpportunityBoardLocation(result.next, "opp-1")?.stageId, "stage-2");
  assert.equal(result.next["pipeline-1"]["stage-1"].length, 0);
});

test("remove and upsert restore an opportunity in the board", () => {
  const board = groupOpportunitiesByPipeline(pipelines, [
    opportunity({ id: "opp-1", pipelineId: "pipeline-1", stageId: "stage-1" }),
    opportunity({ id: "opp-2", pipelineId: "pipeline-2", stageId: "stage-3" }),
  ]);

  const removed = removeOpportunityFromBoard(board, "opp-2");

  assert.equal(removed.pipelineId, "pipeline-2");
  assert.equal(findOpportunityInBoard(removed.next, "opp-2"), null);

  const restored = upsertOpportunityInBoard(removed.next, removed.removed!);

  assert.equal(findOpportunityInBoard(restored, "opp-2")?.id, "opp-2");
  assert.equal(findOpportunityBoardLocation(restored, "opp-2")?.pipelineId, "pipeline-2");
});

test("pipeline metrics sum counts and values across stages", () => {
  const board = groupOpportunitiesByPipeline(pipelines, [
    opportunity({ id: "opp-1", pipelineId: "pipeline-1", stageId: "stage-1", monetaryValue: 1000 }),
    opportunity({ id: "opp-2", pipelineId: "pipeline-1", stageId: "stage-2", monetaryValue: 2500 }),
  ]);

  const metrics = getPipelineMetrics(board["pipeline-1"], pipelines[0].stages);

  assert.equal(metrics.count, 2);
  assert.equal(metrics.totalValue, 3500);
});
