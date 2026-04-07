// ---------------------------------------------------------------------------
// GoHighLevel API v2 — Locations
// ---------------------------------------------------------------------------

import { ghlPost, ghlPut, type GHLClientOptions } from "./client";
import type {
  GHLCreateLocationPayload,
  GHLCreateLocationResponse,
  GHLLocation,
  GHLUpdateLocationPayload,
} from "./types";

/**
 * Create a new GHL sub-account (location).
 * Uses agency-level API key — do NOT pass a locationId.
 *
 * GHL API v2 returns the location object at the top level (not wrapped in
 * `{ location: ... }`). We normalise the response here so callers can
 * destructure `{ location }` consistently with the rest of the codebase.
 */
export async function createLocation(
  data: GHLCreateLocationPayload,
  opts?: GHLClientOptions,
): Promise<GHLCreateLocationResponse> {
  const location = await ghlPost<GHLLocation>("/locations/", data, opts);
  return { location };
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
