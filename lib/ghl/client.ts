// ---------------------------------------------------------------------------
// GoHighLevel API v2 — Core HTTP Client
// Server-only: never import this file in client components.
// ---------------------------------------------------------------------------

import type { GHLErrorBody } from "./types";

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1_000;

// ── Rate-limiter (token bucket: 100 req / 10 s) ───────────────────────────

const BUCKET_SIZE = 100;
const REFILL_INTERVAL_MS = 10_000;

let tokens = BUCKET_SIZE;
let lastRefill = Date.now();

function consumeToken(): boolean {
  const now = Date.now();
  const elapsed = now - lastRefill;
  if (elapsed >= REFILL_INTERVAL_MS) {
    tokens = BUCKET_SIZE;
    lastRefill = now;
  }
  if (tokens > 0) {
    tokens--;
    return true;
  }
  return false;
}

async function waitForToken(): Promise<void> {
  while (!consumeToken()) {
    const waitMs = REFILL_INTERVAL_MS - (Date.now() - lastRefill);
    await new Promise((r) => setTimeout(r, Math.max(waitMs, 100)));
  }
}

// ── Error class ────────────────────────────────────────────────────────────

export class GHLApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: GHLErrorBody | string,
    public readonly url: string,
  ) {
    const msg =
      typeof body === "object" ? body.message : body;
    super(`GHL API ${status}: ${msg} (${url})`);
    this.name = "GHLApiError";
  }
}

// ── Client options ─────────────────────────────────────────────────────────

export interface GHLClientOptions {
  /** Private Integration Token. Falls back to GHL_AGENCY_API_KEY env var. */
  apiKey?: string;
  /** Location ID. Falls back to GHL_AGENCY_ID env var. */
  locationId?: string;
  /** Override base URL (useful for testing). */
  baseUrl?: string;
}

// ── Core request function ──────────────────────────────────────────────────

function resolveKey(opts?: GHLClientOptions): string {
  const key = opts?.apiKey ?? process.env.GHL_AGENCY_API_KEY;
  if (!key) {
    throw new Error(
      "GHL API key is required. Set GHL_AGENCY_API_KEY or pass apiKey in options.",
    );
  }
  return key;
}

function resolveLocationId(opts?: GHLClientOptions): string | undefined {
  return opts?.locationId ?? process.env.GHL_AGENCY_ID ?? undefined;
}

function resolveBaseUrl(opts?: GHLClientOptions): string {
  return opts?.baseUrl ?? GHL_BASE_URL;
}

async function request<T>(
  method: string,
  path: string,
  opts?: GHLClientOptions & {
    body?: unknown;
    params?: Record<string, string | number | boolean | undefined>;
  },
): Promise<T> {
  await waitForToken();

  const baseUrl = resolveBaseUrl(opts);
  const url = new URL(path, baseUrl);

  if (opts?.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${resolveKey(opts)}`,
    "Content-Type": "application/json",
    Version: GHL_API_VERSION,
  };

  const locationId = resolveLocationId(opts);
  if (locationId) {
    headers["locationId"] = locationId;
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, backoff));
    }

    const res = await fetch(url.toString(), {
      method,
      headers,
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
    });

    if (res.ok) {
      // 204 No Content
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    }

    // Retry on rate-limit or server errors
    if (res.status === 429 || res.status >= 500) {
      lastError = new GHLApiError(
        res.status,
        await res.text().catch(() => "Unknown error"),
        url.toString(),
      );
      continue;
    }

    // Non-retryable error
    let errorBody: GHLErrorBody | string;
    try {
      errorBody = (await res.json()) as GHLErrorBody;
    } catch {
      errorBody = await res.text();
    }
    throw new GHLApiError(res.status, errorBody, url.toString());
  }

  throw lastError;
}

// ── Public helpers ─────────────────────────────────────────────────────────

export function ghlGet<T>(
  path: string,
  opts?: GHLClientOptions & {
    params?: Record<string, string | number | boolean | undefined>;
  },
): Promise<T> {
  return request<T>("GET", path, opts);
}

export function ghlPost<T>(
  path: string,
  body: unknown,
  opts?: GHLClientOptions,
): Promise<T> {
  return request<T>("POST", path, { ...opts, body });
}

export function ghlPut<T>(
  path: string,
  body: unknown,
  opts?: GHLClientOptions,
): Promise<T> {
  return request<T>("PUT", path, { ...opts, body });
}

export function ghlDelete<T = void>(
  path: string,
  opts?: GHLClientOptions,
): Promise<T> {
  return request<T>("DELETE", path, opts);
}
