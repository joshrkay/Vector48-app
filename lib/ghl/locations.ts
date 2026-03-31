// ---------------------------------------------------------------------------
// GoHighLevel API v2 — Locations
// ---------------------------------------------------------------------------

import { ghlPost, ghlPut, type GHLClientOptions } from "./client";
import type {
  GHLCreateLocationPayload,
  GHLCreateLocationResponse,
  GHLUpdateLocationPayload,
} from "./types";

/**
 * Create a new GHL sub-account (location).
 * Uses agency-level API key — do NOT pass a locationId.
 */
export function createLocation(
  data: GHLCreateLocationPayload,
  opts?: GHLClientOptions,
): Promise<GHLCreateLocationResponse> {
  return ghlPost<GHLCreateLocationResponse>("/locations", data, opts);
}

/**
 * Update an existing location's profile and settings.
 * Uses the location's own API token.
 */
export function updateLocation(
  locationId: string,
  data: GHLUpdateLocationPayload,
  opts?: GHLClientOptions,
): Promise<void> {
  return ghlPut<void>(`/locations/${locationId}`, data, opts);
}
