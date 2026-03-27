// ---------------------------------------------------------------------------
// GoHighLevel API — Typed Error Hierarchy
// ---------------------------------------------------------------------------

/**
 * Base error for all GHL API failures.
 * Tokens and PII are never included in error messages.
 */
export class GHLApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    opts: { code: string; status: number; retryable: boolean },
  ) {
    super(message);
    this.name = "GHLApiError";
    this.code = opts.code;
    this.status = opts.status;
    this.retryable = opts.retryable;
  }
}

/** 429 from GHL or local per-location rate limit exceeded. */
export class GHLRateLimitError extends GHLApiError {
  constructor(message = "Rate limit exceeded") {
    super(message, { code: "RATE_LIMIT", status: 429, retryable: true });
    this.name = "GHLRateLimitError";
  }
}

/** 401 / 403 — invalid or expired token. */
export class GHLAuthError extends GHLApiError {
  constructor(message = "Authentication failed") {
    super(message, { code: "AUTH_ERROR", status: 401, retryable: false });
    this.name = "GHLAuthError";
  }
}

/** 404 — resource not found. */
export class GHLNotFoundError extends GHLApiError {
  constructor(message = "Resource not found") {
    super(message, { code: "NOT_FOUND", status: 404, retryable: false });
    this.name = "GHLNotFoundError";
  }
}

/** 400 / 422 — validation or bad request. */
export class GHLValidationError extends GHLApiError {
  readonly details: string | undefined;

  constructor(message = "Validation error", details?: string) {
    super(message, { code: "VALIDATION_ERROR", status: 422, retryable: false });
    this.name = "GHLValidationError";
    this.details = details;
  }
}

/** 500–599 — GHL server error, retryable. */
export class GHLServerError extends GHLApiError {
  constructor(status: number, message = "GHL server error") {
    super(message, { code: "SERVER_ERROR", status, retryable: true });
    this.name = "GHLServerError";
  }
}

// ---------------------------------------------------------------------------
// Helper: map an HTTP status + body to the correct typed error
// ---------------------------------------------------------------------------

export function toGHLError(
  status: number,
  body: unknown,
  path: string,
): GHLApiError {
  const msg = extractMessage(body, path);

  if (status === 429) return new GHLRateLimitError(msg);
  if (status === 401 || status === 403) return new GHLAuthError(msg);
  if (status === 404) return new GHLNotFoundError(msg);
  if (status === 400 || status === 422)
    return new GHLValidationError(msg, typeof body === "object" ? JSON.stringify(body) : undefined);
  if (status >= 500) return new GHLServerError(status, msg);

  return new GHLApiError(msg, {
    code: "UNKNOWN",
    status,
    retryable: false,
  });
}

/** Extract a safe error message — never include tokens or raw response dumps. */
function extractMessage(body: unknown, path: string): string {
  if (typeof body === "object" && body !== null) {
    const obj = body as Record<string, unknown>;
    if (typeof obj.message === "string") return `${obj.message} (${path})`;
    if (typeof obj.error === "string") return `${obj.error} (${path})`;
    if (typeof obj.msg === "string") return `${obj.msg} (${path})`;
  }
  if (typeof body === "string" && body.length > 0 && body.length < 200) {
    return `${body} (${path})`;
  }
  return `GHL API error (${path})`;
}
