// ---------------------------------------------------------------------------
// GoHighLevel API v2 — Opportunities / Pipeline Service
// Docs: https://marketplace.gohighlevel.com/docs/
// ---------------------------------------------------------------------------

import { ghlGet, ghlPost, ghlPut, ghlDelete, type GHLClientOptions } from "./client";
import type {
  GHLOpportunitiesListParams,
  GHLOpportunitiesListResponse,
  GHLOpportunityResponse,
  GHLCreateOpportunityPayload,
  GHLUpdateOpportunityPayload,
  GHLPipelinesListResponse,
} from "./types";

// ── Pipelines ──────────────────────────────────────────────────────────────

export function getPipelines(opts?: GHLClientOptions) {
  return ghlGet<GHLPipelinesListResponse>("/opportunities/pipelines", opts);
}

// ── List opportunities ─────────────────────────────────────────────────────

export function getOpportunities(
  params?: GHLOpportunitiesListParams,
  opts?: GHLClientOptions,
) {
  const { locationId, ...rest } = params ?? {};
  return ghlGet<GHLOpportunitiesListResponse>("/opportunities/search", {
    ...opts,
    locationId: locationId ?? opts?.locationId,
    params: rest as Record<string, string | number | boolean | undefined>,
  });
}

// ── Single opportunity ─────────────────────────────────────────────────────

export function getOpportunity(
  opportunityId: string,
  opts?: GHLClientOptions,
) {
  return ghlGet<GHLOpportunityResponse>(
    `/opportunities/${opportunityId}`,
    opts,
  );
}

// ── Create ─────────────────────────────────────────────────────────────────

export function createOpportunity(
  data: GHLCreateOpportunityPayload,
  opts?: GHLClientOptions,
) {
  return ghlPost<GHLOpportunityResponse>("/opportunities/", data, opts);
}

// ── Update ─────────────────────────────────────────────────────────────────

export function updateOpportunity(
  opportunityId: string,
  data: GHLUpdateOpportunityPayload,
  opts?: GHLClientOptions,
) {
  return ghlPut<GHLOpportunityResponse>(
    `/opportunities/${opportunityId}`,
    data,
    opts,
  );
}

// ── Delete ─────────────────────────────────────────────────────────────────

export function deleteOpportunity(
  opportunityId: string,
  opts?: GHLClientOptions,
) {
  return ghlDelete(`/opportunities/${opportunityId}`, opts);
}

// ── Update status (convenience) ────────────────────────────────────────────

export function updateOpportunityStatus(
  opportunityId: string,
  status: "open" | "won" | "lost" | "abandoned",
  opts?: GHLClientOptions,
) {
  return ghlPut<GHLOpportunityResponse>(
    `/opportunities/${opportunityId}/status`,
    { status },
    opts,
  );
}
