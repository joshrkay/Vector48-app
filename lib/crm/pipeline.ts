import type {
  GHLContactNote,
  GHLMessage,
  GHLOpportunity,
  GHLOpportunityStatus,
  GHLPipeline,
  GHLPipelineStage,
} from "@/lib/ghl/types";

export interface PipelineContactSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface PipelineOpportunitySummary {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string | null;
  jobType: string;
  monetaryValue: number | null;
  pipelineId: string;
  stageId: string;
  status: GHLOpportunityStatus;
  enteredStageAt: string;
  dateAdded: string;
  recipeSlugs: string[];
}

export interface PipelineActivityItem {
  id: string;
  timestamp: string;
  type: "message" | "automation_event";
  title: string;
  body: string;
  direction?: "inbound" | "outbound";
}

export interface PipelineOpportunityDetail {
  opportunity: PipelineOpportunitySummary;
  contact: PipelineContactSummary;
  notes: GHLContactNote[];
  activity: PipelineActivityItem[];
}

export type PipelineGroupedOpportunities = Record<string, PipelineOpportunitySummary[]>;
export type PipelineBoardGroups = Record<string, PipelineGroupedOpportunities>;

function sortStageOpportunities(
  opportunities: PipelineOpportunitySummary[],
): PipelineOpportunitySummary[] {
  return [...opportunities].sort((a, b) => {
    const byEntered = new Date(b.enteredStageAt).getTime() - new Date(a.enteredStageAt).getTime();
    if (byEntered !== 0) return byEntered;
    return a.contactName.localeCompare(b.contactName);
  });
}

function fallbackContactName(opportunity: GHLOpportunity): string {
  return opportunity.contact?.name?.trim() || "Contact";
}

function sanitizeRecipeSlugs(recipeSlugs: string[]): string[] {
  return Array.from(new Set(recipeSlugs.filter(Boolean))).sort();
}

export function normalizePipelineOpportunity(
  opportunity: GHLOpportunity,
  contact?: {
    name?: string | null;
    phone?: string | null;
  } | null,
  recipeSlugs: string[] = [],
): PipelineOpportunitySummary {
  const resolvedName =
    contact?.name?.trim() ||
    opportunity.contact?.name?.trim() ||
    fallbackContactName(opportunity);

  return {
    id: opportunity.id,
    contactId: opportunity.contactId,
    contactName: resolvedName,
    contactPhone: contact?.phone ?? opportunity.contact?.phone ?? null,
    jobType: opportunity.name,
    monetaryValue: typeof opportunity.monetaryValue === "number" ? opportunity.monetaryValue : null,
    pipelineId: opportunity.pipelineId,
    stageId: opportunity.pipelineStageId,
    status: opportunity.status,
    enteredStageAt: opportunity.lastStatusChangeAt ?? opportunity.dateAdded,
    dateAdded: opportunity.dateAdded,
    recipeSlugs: sanitizeRecipeSlugs(recipeSlugs),
  };
}

export function groupOpportunitiesByStage(
  stages: GHLPipelineStage[],
  opportunities: PipelineOpportunitySummary[],
): PipelineGroupedOpportunities {
  const grouped: PipelineGroupedOpportunities = Object.fromEntries(
    stages.map((stage) => [stage.id, []]),
  );

  for (const opportunity of opportunities) {
    const bucket = grouped[opportunity.stageId];
    if (bucket) {
      bucket.push(opportunity);
    }
  }

  for (const stage of stages) {
    grouped[stage.id] = sortStageOpportunities(grouped[stage.id] ?? []);
  }

  return grouped;
}

export function groupOpportunitiesByPipeline(
  pipelines: Pick<GHLPipeline, "id" | "stages">[],
  opportunities: PipelineOpportunitySummary[],
): PipelineBoardGroups {
  const grouped: PipelineBoardGroups = Object.fromEntries(
    pipelines.map((pipeline) => [pipeline.id, groupOpportunitiesByStage(pipeline.stages, [])]),
  );

  for (const opportunity of opportunities) {
    const pipelineGroups = grouped[opportunity.pipelineId];
    const bucket = pipelineGroups?.[opportunity.stageId];
    if (bucket) {
      bucket.push(opportunity);
    }
  }

  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages) {
      grouped[pipeline.id][stage.id] = sortStageOpportunities(
        grouped[pipeline.id][stage.id] ?? [],
      );
    }
  }

  return grouped;
}

export function getStageMetrics(opportunities: PipelineOpportunitySummary[]) {
  return {
    count: opportunities.length,
    totalValue: opportunities.reduce((sum, opportunity) => {
      return sum + (opportunity.monetaryValue ?? 0);
    }, 0),
  };
}

export function getPipelineMetrics(
  grouped: PipelineGroupedOpportunities,
  stages: GHLPipelineStage[],
) {
  return stages.reduce(
    (acc, stage) => {
      const metrics = getStageMetrics(grouped[stage.id] ?? []);
      return {
        count: acc.count + metrics.count,
        totalValue: acc.totalValue + metrics.totalValue,
      };
    },
    { count: 0, totalValue: 0 },
  );
}

export function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

export function normalizeUsPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  const trimmed =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return trimmed.length === 10 ? trimmed : null;
}

export function getDaysInStage(
  opportunity: Pick<PipelineOpportunitySummary, "enteredStageAt">,
  now = Date.now(),
): number {
  const startedAt = new Date(opportunity.enteredStageAt).getTime();
  if (Number.isNaN(startedAt)) return 0;
  const diff = now - startedAt;
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export function moveOpportunityToStage(
  grouped: PipelineGroupedOpportunities,
  opportunityId: string,
  destinationStageId: string,
): {
  next: PipelineGroupedOpportunities;
  previousStageId: string | null;
  moved: PipelineOpportunitySummary | null;
} {
  let previousStageId: string | null = null;
  let moved: PipelineOpportunitySummary | null = null;

  for (const [stageId, opportunities] of Object.entries(grouped)) {
    const index = opportunities.findIndex((opportunity) => opportunity.id === opportunityId);
    if (index >= 0) {
      previousStageId = stageId;
      moved = opportunities[index];
      break;
    }
  }

  if (!moved || !previousStageId) {
    return { next: grouped, previousStageId: null, moved: null };
  }

  if (!grouped[destinationStageId] || previousStageId === destinationStageId) {
    return { next: grouped, previousStageId, moved };
  }

  const next: PipelineGroupedOpportunities = {};

  for (const [stageId, opportunities] of Object.entries(grouped)) {
    if (stageId === previousStageId) {
      next[stageId] = opportunities.filter((opportunity) => opportunity.id !== opportunityId);
      continue;
    }

    if (stageId === destinationStageId) {
      next[stageId] = sortStageOpportunities([
        {
          ...moved,
          stageId: destinationStageId,
          enteredStageAt: new Date().toISOString(),
        },
        ...opportunities,
      ]);
      continue;
    }

    next[stageId] = [...opportunities];
  }

  return {
    next,
    previousStageId,
    moved: {
      ...moved,
      stageId: destinationStageId,
    },
  };
}

export function moveOpportunityInBoard(
  board: PipelineBoardGroups,
  opportunityId: string,
  destinationStageId: string,
): {
  next: PipelineBoardGroups;
  pipelineId: string | null;
  previousStageId: string | null;
  moved: PipelineOpportunitySummary | null;
} {
  const location = findOpportunityBoardLocation(board, opportunityId);
  if (!location) {
    return {
      next: board,
      pipelineId: null,
      previousStageId: null,
      moved: null,
    };
  }

  const result = moveOpportunityToStage(
    board[location.pipelineId] ?? {},
    opportunityId,
    destinationStageId,
  );

  if (!result.moved) {
    return {
      next: board,
      pipelineId: location.pipelineId,
      previousStageId: result.previousStageId,
      moved: null,
    };
  }

  return {
    next: {
      ...board,
      [location.pipelineId]: result.next,
    },
    pipelineId: location.pipelineId,
    previousStageId: result.previousStageId,
    moved: result.moved,
  };
}

export function removeOpportunityFromGroups(
  grouped: PipelineGroupedOpportunities,
  opportunityId: string,
): PipelineGroupedOpportunities {
  return Object.fromEntries(
    Object.entries(grouped).map(([stageId, opportunities]) => [
      stageId,
      opportunities.filter((opportunity) => opportunity.id !== opportunityId),
    ]),
  );
}

export function removeOpportunityFromBoard(
  board: PipelineBoardGroups,
  opportunityId: string,
): {
  next: PipelineBoardGroups;
  pipelineId: string | null;
  stageId: string | null;
  removed: PipelineOpportunitySummary | null;
} {
  const location = findOpportunityBoardLocation(board, opportunityId);
  if (!location) {
    return {
      next: board,
      pipelineId: null,
      stageId: null,
      removed: null,
    };
  }

  const grouped = board[location.pipelineId] ?? {};
  const removed =
    grouped[location.stageId]?.find((opportunity) => opportunity.id === opportunityId) ?? null;

  return {
    next: {
      ...board,
      [location.pipelineId]: removeOpportunityFromGroups(grouped, opportunityId),
    },
    pipelineId: location.pipelineId,
    stageId: location.stageId,
    removed,
  };
}

export function upsertOpportunityInGroups(
  grouped: PipelineGroupedOpportunities,
  opportunity: PipelineOpportunitySummary,
): PipelineGroupedOpportunities {
  const withoutCurrent = removeOpportunityFromGroups(grouped, opportunity.id);

  if (!withoutCurrent[opportunity.stageId]) {
    return withoutCurrent;
  }

  return {
    ...withoutCurrent,
    [opportunity.stageId]: sortStageOpportunities([
      opportunity,
      ...withoutCurrent[opportunity.stageId],
    ]),
  };
}

export function upsertOpportunityInBoard(
  board: PipelineBoardGroups,
  opportunity: PipelineOpportunitySummary,
): PipelineBoardGroups {
  const grouped = board[opportunity.pipelineId];
  if (!grouped) {
    return board;
  }

  return {
    ...board,
    [opportunity.pipelineId]: upsertOpportunityInGroups(grouped, opportunity),
  };
}

export function findOpportunityStageId(
  grouped: PipelineGroupedOpportunities,
  opportunityId: string,
): string | null {
  for (const [stageId, opportunities] of Object.entries(grouped)) {
    if (opportunities.some((opportunity) => opportunity.id === opportunityId)) {
      return stageId;
    }
  }

  return null;
}

export function findOpportunityBoardLocation(
  board: PipelineBoardGroups,
  opportunityId: string,
): { pipelineId: string; stageId: string } | null {
  for (const [pipelineId, grouped] of Object.entries(board)) {
    const stageId = findOpportunityStageId(grouped, opportunityId);
    if (stageId) {
      return { pipelineId, stageId };
    }
  }

  return null;
}

export function findOpportunityInBoard(
  board: PipelineBoardGroups,
  opportunityId: string,
): PipelineOpportunitySummary | null {
  const location = findOpportunityBoardLocation(board, opportunityId);
  if (!location) return null;

  return (
    board[location.pipelineId]?.[location.stageId]?.find(
      (opportunity) => opportunity.id === opportunityId,
    ) ?? null
  );
}

export function messagesToActivityItems(
  messages: GHLMessage[],
): PipelineActivityItem[] {
  return messages.map((message) => ({
    id: `message:${message.id}`,
    timestamp: message.dateAdded,
    type: "message",
    title: message.direction === "inbound" ? "Inbound message" : "Outbound message",
    body: message.body,
    direction: message.direction,
  }));
}
