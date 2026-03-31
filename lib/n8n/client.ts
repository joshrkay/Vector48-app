// ---------------------------------------------------------------------------
// n8n REST API client (n8n.cloud and self-hosted: same REST paths; set N8N_BASE_URL).
// Auth: header X-N8N-API-KEY.
// ---------------------------------------------------------------------------

import {
  classifyN8nError,
  N8nApiError,
  N8nNotFoundError,
} from "./errors";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export interface N8nWorkflowCreateResult {
  id: string;
  active: boolean;
}

export interface N8nCredentialSummary {
  id: string;
  name: string;
  type: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface N8nCredentialCreateResult {
  id: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitterMs(base: number): number {
  return base + Math.floor(Math.random() * 100);
}

export class N8nClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly apiKey: string,
  ) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  /**
   * Raw request with retries on 5xx and 429 only.
   */
  async request<T>(
    method: string,
    path: string,
    options?: { body?: unknown; query?: Record<string, string> },
  ): Promise<T> {
    const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${this.baseUrl}/`);
    if (options?.query) {
      for (const [k, v] of Object.entries(options.query)) {
        url.searchParams.set(k, v);
      }
    }

    const maxAttempts = 4;
    let lastErr: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await fetch(url.toString(), {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-N8N-API-KEY": this.apiKey,
        },
        body:
          options?.body !== undefined
            ? JSON.stringify(options.body)
            : undefined,
      });

      const text = await res.text();
      let parsed: unknown = text;
      if (text.length > 0) {
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          parsed = text;
        }
      } else {
        parsed = undefined;
      }

      if (res.ok) {
        return parsed as T;
      }

      const err = classifyN8nError(res.status, parsed, `${method} ${path}`);
      lastErr = err;

      if (err.retryable && attempt < maxAttempts - 1) {
        const backoff = jitterMs(200 * 2 ** attempt);
        await sleep(backoff);
        continue;
      }

      throw err;
    }

    throw lastErr instanceof Error ? lastErr : new Error("n8n request failed");
  }

  async createWorkflow(workflowJson: unknown): Promise<N8nWorkflowCreateResult> {
    const data = await this.request<Record<string, unknown>>(
      "POST",
      "/api/v1/workflows",
      { body: workflowJson },
    );
    const id = data.id;
    const active = Boolean(data.active);
    if (typeof id !== "string") {
      throw new N8nApiError(500, "n8n create workflow: missing id in response", "INVALID_RESPONSE");
    }
    return { id, active };
  }

  async activateWorkflow(id: string): Promise<void> {
    await this.request("POST", `/api/v1/workflows/${encodeURIComponent(id)}/activate`);
  }

  async deactivateWorkflow(id: string): Promise<void> {
    await this.request("POST", `/api/v1/workflows/${encodeURIComponent(id)}/deactivate`);
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.request("DELETE", `/api/v1/workflows/${encodeURIComponent(id)}`);
  }

  async getWorkflow(id: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      "GET",
      `/api/v1/workflows/${encodeURIComponent(id)}`,
    );
  }

  async createCredential(
    name: string,
    type: string,
    data: Record<string, unknown>,
  ): Promise<N8nCredentialCreateResult> {
    const body = { name, type, data };
    const res = await this.request<Record<string, unknown>>("POST", "/api/v1/credentials", {
      body,
    });
    const cid = res.id;
    if (typeof cid !== "string") {
      throw new N8nApiError(500, "n8n create credential: missing id", "INVALID_RESPONSE");
    }
    return { id: cid };
  }

  /**
   * List credentials. Optional query keys depend on n8n version; passed through.
   */
  async getCredentials(query?: Record<string, string>): Promise<N8nCredentialSummary[]> {
    const raw = await this.request<unknown>("GET", "/api/v1/credentials", { query });
    const list = Array.isArray(raw) ? raw : (raw as { data?: unknown })?.data;
    if (!Array.isArray(list)) {
      return [];
    }
    return list.map((c) => {
      const row = c as Record<string, unknown>;
      return {
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
        type: String(row.type ?? ""),
        createdAt: row.createdAt != null ? String(row.createdAt) : undefined,
        updatedAt: row.updatedAt != null ? String(row.updatedAt) : undefined,
      };
    });
  }

  async deleteCredential(id: string): Promise<void> {
    try {
      await this.request(
        "DELETE",
        `/api/v1/credentials/${encodeURIComponent(id)}`,
      );
    } catch (e) {
      if (e instanceof N8nNotFoundError) {
        return;
      }
      throw e;
    }
  }
}

export function createN8nClientFromEnv(): N8nClient {
  const base = process.env.N8N_BASE_URL;
  const key = process.env.N8N_API_KEY;
  if (!base || !key) {
    throw new Error("N8N_BASE_URL and N8N_API_KEY must be set");
  }
  return new N8nClient(base, key);
}
