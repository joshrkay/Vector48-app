// ---------------------------------------------------------------------------
// GoHighLevel API v2 — Error Types
// Server-only: never import this file in client components.
// ---------------------------------------------------------------------------

/**
 * Base error for all GHL API failures. Subclassed by specific error types.
 * Never exposes raw GHL response bodies to callers — only normalized fields.
 */
export class GHLApiError extends Error {
  /** Whether this error is safe to retry (429s, 5xx). */
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

/** 429 — Rate limit exceeded. Always retryable. */
export class GHLRateLimitError extends GHLApiError {
  constructor(message = "GHL rate limit exceeded") {
    super(429, message, "RATE_LIMIT", true);
    this.name = "GHLRateLimitError";
  }
}

/** 401 / 403 — Token invalid, expired, or insufficient scope. Never retryable. */
export class GHLAuthError extends GHLApiError {
  constructor(message = "GHL authentication failed") {
    super(401, message, "AUTH_ERROR", false);
    this.name = "GHLAuthError";
  }
}

/** 404 — Resource not found. Never retryable. */
export class GHLNotFoundError extends GHLApiError {
  constructor(resource: string, id?: string) {
    const msg = id
      ? `GHL ${resource} not found: ${id}`
      : `GHL ${resource} not found`;
    super(404, msg, "NOT_FOUND", false);
    this.name = "GHLNotFoundError";
  }
}

/** 400 / 422 — Bad request or validation failure. Never retryable. */
export class GHLValidationError extends GHLApiError {
  constructor(
    statusCode: number,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(statusCode, message, "VALIDATION_ERROR", false);
    this.name = "GHLValidationError";
  }
}

/** 500+ — GHL server error. Always retryable. */
export class GHLServerError extends GHLApiError {
  constructor(statusCode: number, message = "GHL server error") {
    super(statusCode, message, "SERVER_ERROR", true);
    this.name = "GHLServerError";
  }
}

/**
 * Map a raw HTTP status + body into the appropriate typed error.
 * Keeps raw GHL response details out of error messages.
 */
export function classifyGHLError(
  status: number,
  body: unknown,
  path: string,
): GHLApiError {
  const msg = extractMessage(body);

  if (status === 429) {
    return new GHLRateLimitError(msg || undefined);
  }
  if (status === 401 || status === 403) {
    return new GHLAuthError(msg || undefined);
  }
  if (status === 404) {
    return new GHLNotFoundError(path);
  }
  if (status === 400 || status === 422) {
    return new GHLValidationError(
      status,
      msg || "Validation failed",
      extractFieldErrors(body),
    );
  }
  if (status >= 500) {
    return new GHLServerError(status, msg || undefined);
  }

  // Catch-all for unexpected status codes
  return new GHLApiError(status, msg || `GHL API error ${status}`, "UNKNOWN");
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractMessage(body: unknown): string | undefined {
  if (typeof body === "string") return body || undefined;
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.message === "string") return b.message;
    if (typeof b.msg === "string") return b.msg;
    if (typeof b.error === "string") return b.error;
  }
  return undefined;
}

function extractFieldErrors(
  body: unknown,
): Record<string, string> | undefined {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (b.errors && typeof b.errors === "object" && !Array.isArray(b.errors)) {
      return b.errors as Record<string, string>;
    }
  }
  return undefined;
}
