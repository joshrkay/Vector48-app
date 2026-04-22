// ---------------------------------------------------------------------------
// GoHighLevel API v2 — Campaigns Service
// Docs: https://marketplace.gohighlevel.com/docs/
// ---------------------------------------------------------------------------

import { ghlGet, type GHLClientOptions } from "./client";
import type { GHLCampaignsListResponse } from "./types";

// ── List campaigns ─────────────────────────────────────────────────────────

export function getCampaigns(opts?: GHLClientOptions) {
  return ghlGet<GHLCampaignsListResponse>("/campaigns/", opts);
}
