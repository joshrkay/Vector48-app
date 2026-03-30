import "server-only";

const MAX_RETRIES = 4;
const RETRY_BACKOFF_MS = [500, 1_500, 3_000, 6_000];

export class N8nClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "N8nClientError";
  }
}

export interface N8nCredentialListItem {
  id: string;
  name: string;
  type: string;
  data?: unknown;
}

export interface CreateWorkflowResult {
  id: string;
  active: boolean;
}

export interface CreateCredentialResult {
  id: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Typed client for the n8n public REST API (`X-N8N-API-KEY`).
 * Pass `baseUrl` including `/api/v1` with no trailing slash (e.g. n8n.cloud instance URL).
 * Self-hosted installs may add a path prefix, e.g. `https://host/n8n/api/v1`.
 */
export class N8nClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly apiKey: string,
  ) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  private async request<T>(
    method: string,
    path: string,
    options?: { body?: unknown; signal?: AbortSignal },
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    let lastErr: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const jsonBody = options?.body;
        const res = await fetch(url, {
          method,
          headers: {
            "X-N8N-API-KEY": this.apiKey,
            Accept: "application/json",
            ...(jsonBody !== undefined
              ? { "Content-Type": "application/json" }
              : {}),
          },
          body: jsonBody !== undefined ? JSON.stringify(jsonBody) : undefined,
          signal: options?.signal,
        });

        const text = await res.text();
        let parsed: unknown = text;
        if (text.length > 0) {
          try {
            parsed = JSON.parse(text) as unknown;
          } catch {
            parsed = text;
          }
        }

        if (res.status >= 500 || res.status === 429) {
          console.warn(
            JSON.stringify({
              level: "warn",
              service: "n8n",
              event: "retryable_response",
              method,
              path,
              status: res.status,
              attempt,
            }),
          );
          if (attempt < MAX_RETRIES - 1) {
            await sleep(RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]);
            continue;
          }
        }

        if (res.status >= 400 && res.status < 500) {
          const msg =
            typeof parsed === "object" &&
            parsed !== null &&
            "message" in parsed &&
            typeof (parsed as { message: unknown }).message === "string"
              ? (parsed as { message: string }).message
              : `N8N request failed (${res.status})`;
          throw new N8nClientError(msg, res.status, path, parsed);
        }

        if (!res.ok) {
          throw new N8nClientError(
            `N8N request failed (${res.status})`,
            res.status,
            path,
            parsed,
          );
        }

        return parsed as T;
      } catch (e) {
        lastErr = e;
        if (e instanceof N8nClientError) {
          throw e;
        }
        const retryable =
          e instanceof TypeError ||
          (e instanceof Error && e.name === "AbortError");
        if (retryable && attempt < MAX_RETRIES - 1) {
          await sleep(RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]);
          continue;
        }
        throw e;
      }
    }

    throw lastErr instanceof Error
      ? lastErr
      : new Error(String(lastErr));
  }

  async createWorkflow(workflowJson: unknown): Promise<CreateWorkflowResult> {
    const data = await this.request<Record<string, unknown>>(
      "POST",
      "/workflows",
      { body: workflowJson },
    );
    const id = data.id;
    const active = data.active === true;
    if (typeof id !== "string") {
      throw new N8nClientError(
        "N8N create workflow response missing id",
        500,
        "/workflows",
        data,
      );
    }
    return { id, active };
  }

  async getWorkflow(id: string): Promise<unknown> {
    return this.request<unknown>("GET", `/workflows/${encodeURIComponent(id)}`);
  }

  async updateWorkflow(id: string, workflowJson: unknown): Promise<unknown> {
    return this.request<unknown>("PATCH", `/workflows/${encodeURIComponent(id)}`, {
      body: workflowJson,
    });
  }

  async activateWorkflow(id: string): Promise<void> {
    await this.request<unknown>(
      "POST",
      `/workflows/${encodeURIComponent(id)}/activate`,
    );
  }

  async deactivateWorkflow(id: string): Promise<void> {
    await this.request<unknown>(
      "POST",
      `/workflows/${encodeURIComponent(id)}/deactivate`,
    );
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.request<unknown>(
      "DELETE",
      `/workflows/${encodeURIComponent(id)}`,
    );
  }

  async createCredential(
    name: string,
    type: string,
    data: Record<string, unknown>,
  ): Promise<CreateCredentialResult> {
    const body = { name, type, data };
    const res = await this.request<Record<string, unknown>>(
      "POST",
      "/credentials",
      { body },
    );
    const cid = res.id;
    if (typeof cid !== "string") {
      throw new N8nClientError(
        "N8N create credential response missing id",
        500,
        "/credentials",
        res,
      );
    }
    return { id: cid };
  }

  async getCredentials(
    filter?: Record<string, string>,
  ): Promise<N8nCredentialListItem[]> {
    const qs =
      filter && Object.keys(filter).length > 0
        ? `?${new URLSearchParams(filter).toString()}`
        : "";
    const res = await this.request<unknown>("GET", `/credentials${qs}`);
    if (Array.isArray(res)) {
      return res as N8nCredentialListItem[];
    }
    if (
      typeof res === "object" &&
      res !== null &&
      "data" in res &&
      Array.isArray((res as { data: unknown }).data)
    ) {
      return (res as { data: N8nCredentialListItem[] }).data;
    }
    return [];
  }

  async deleteCredential(id: string): Promise<void> {
    await this.request<unknown>(
      "DELETE",
      `/credentials/${encodeURIComponent(id)}`,
    );
  }
}
