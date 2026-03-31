// ---------------------------------------------------------------------------
// n8n REST API — Error types (mirror lib/ghl/errors.ts patterns)
// Self-hosted and n8n.cloud use the same routes; only base URL / limits differ.
// ---------------------------------------------------------------------------

/**
 * Base error for n8n API failures. Does not embed raw response bodies with secrets.
 */
export class N8nApiError extends Error {
  public readonly retryable: boolean;

  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
    retryable = false,
  ) {
    super(message);
    this.name = "N8nApiError";
    this.retryable = retryable;
  }
}

/** 401 — Invalid or missing API key. */
export class N8nAuthError extends N8nApiError {
  constructor(message = "n8n API authentication failed") {
    super(401, message, "AUTH_ERROR", false);
    this.name = "N8nAuthError";
  }
}

/** 404 — Resource missing. */
export class N8nNotFoundError extends N8nApiError {
  constructor(resource: string, id?: string) {
    const msg = id ? `n8n ${resource} not found: ${id}` : `n8n ${resource} not found`;
    super(404, msg, "NOT_FOUND", false);
    this.name = "N8nNotFoundError";
  }
}

/** 400 / 422 — Client error. */
export class N8nValidationError extends N8nApiError {
  constructor(
    statusCode: number,
    message: string,
    public readonly detail?: string,
  ) {
    super(statusCode, message, "VALIDATION_ERROR", false);
    this.name = "N8nValidationError";
  }
}

/** 429 — Rate limited. */
export class N8nRateLimitError extends N8nApiError {
  constructor(message = "n8n rate limit exceeded") {
    super(429, message, "RATE_LIMIT", true);
    this.name = "N8nRateLimitError";
  }
}

/** 5xx — Server error (retryable). */
export class N8nServerError extends N8nApiError {
  constructor(statusCode: number, message = "n8n server error") {
    super(statusCode, message, "SERVER_ERROR", true);
    this.name = "N8nServerError";
  }
}

function summarizeBody(body: unknown): string {
  if (body === null || body === undefined) return "";
  if (typeof body === "string") return body.slice(0, 200);
  if (typeof body === "object" && body !== null && "message" in body) {
    const m = (body as { message?: unknown }).message;
    if (typeof m === "string") return m.slice(0, 200);
  }
  try {
    return JSON.stringify(body).slice(0, 200);
  } catch {
    return "";
  }
}

export function classifyN8nError(
  status: number,
  body: unknown,
  path: string,
): N8nApiError {
  const detail = summarizeBody(body);
  const base = detail ? `${path}: ${detail}` : path;

  if (status === 401 || status === 403) {
    return new N8nAuthError(base);
  }
  if (status === 404) {
    return new N8nNotFoundError("resource");
  }
  if (status === 429) {
    return new N8nRateLimitError(base);
  }
  if (status >= 400 && status < 500) {
    return new N8nValidationError(status, base, detail);
  }
  if (status >= 500) {
    return new N8nServerError(status, base);
  }
  return new N8nValidationError(status, base, detail);
}
