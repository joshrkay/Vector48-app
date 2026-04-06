import "server-only";

// ---------------------------------------------------------------------------
// GoHighLevel API v2 — Error Types
// ---------------------------------------------------------------------------

export class GHLApiError extends Error {
  public readonly retryable: boolean;

  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
    retryable = false,
  ) {
    super(message);
    this.name = "GHLApiError";
    this.retryable = retryable;
  }
}

export class GHLAuthError extends GHLApiError {
  constructor(message = "GHL authentication failed", statusCode = 401) {
    super(statusCode, message, "AUTH_ERROR", false);
    this.name = "GHLAuthError";
  }
}

export class GHLNotFoundError extends GHLApiError {
  constructor(resource = "resource", id?: string) {
    super(
      404,
      id ? `GHL ${resource} not found: ${id}` : `GHL ${resource} not found`,
      "NOT_FOUND",
      false,
    );
    this.name = "GHLNotFoundError";
  }
}

export class GHLRateLimitError extends GHLApiError {
  constructor(
    message = "GHL rate limit exceeded",
    public readonly retryAfter?: number,
  ) {
    super(429, message, "RATE_LIMIT", true);
    this.name = "GHLRateLimitError";
  }
}

export class GHLValidationError extends GHLApiError {
  constructor(
    message = "GHL validation failed",
    public readonly fields?: Record<string, string>,
    statusCode = 422,
  ) {
    super(statusCode, message, "VALIDATION_ERROR", false);
    this.name = "GHLValidationError";
  }
}

export class GHLServerError extends GHLApiError {
  constructor(statusCode = 500, message = "GHL server error") {
    super(statusCode, message, "SERVER_ERROR", true);
    this.name = "GHLServerError";
  }
}

export class GHLNetworkError extends GHLApiError {
  constructor(message = "GHL network error") {
    super(0, message, "NETWORK_ERROR", true);
    this.name = "GHLNetworkError";
  }
}

export function classifyGHLError(
  status: number,
  body: unknown,
  path: string,
  retryAfterHeader?: string | null,
): GHLApiError {
  const resource = inferResourceName(path);

  if (status === 401 || status === 403) {
    return new GHLAuthError("GHL authentication failed", status);
  }

  if (status === 404) {
    return new GHLNotFoundError(resource);
  }

  if (status === 429) {
    return new GHLRateLimitError(
      "GHL rate limit exceeded",
      parseRetryAfter(retryAfterHeader),
    );
  }

  if (status === 400 || status === 422) {
    return new GHLValidationError(
      safeValidationMessage(body),
      extractFieldErrors(body),
      status,
    );
  }

  if (status >= 500) {
    return new GHLServerError(status);
  }

  return new GHLApiError(status, `GHL API request failed (${status})`, "UNKNOWN");
}

function inferResourceName(path: string): string {
  const normalized = path.replace(/^\/+/, "");
  const segment = normalized.split("/")[0];
  return segment || "resource";
}

function parseRetryAfter(retryAfterHeader?: string | null): number | undefined {
  if (!retryAfterHeader) return undefined;

  const seconds = Number.parseInt(retryAfterHeader, 10);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds;
  }

  const date = new Date(retryAfterHeader);
  if (Number.isNaN(date.getTime())) return undefined;

  const deltaMs = date.getTime() - Date.now();
  return deltaMs > 0 ? Math.ceil(deltaMs / 1000) : undefined;
}

function safeValidationMessage(body: unknown): string {
  if (body && typeof body === "object") {
    const candidate = (body as Record<string, unknown>).message;
    if (
      typeof candidate === "string" &&
      candidate.trim() &&
      candidate.length <= 160
    ) {
      return candidate.trim();
    }
  }

  return "GHL validation failed";
}

function extractFieldErrors(body: unknown): Record<string, string> | undefined {
  if (!body || typeof body !== "object") return undefined;

  const errors = (body as Record<string, unknown>).errors;
  if (!errors || typeof errors !== "object" || Array.isArray(errors)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(errors as Record<string, unknown>)
      .filter(([, value]) => typeof value === "string")
      .map(([field, value]) => [field, String(value)]),
  );
}
