// ---------------------------------------------------------------------------
// Gate for browser + API n8n dev tooling (never enable in production unless intentional).
// ---------------------------------------------------------------------------
import "server-only";

export function isN8nDevToolsEnabled(): boolean {
  if (process.env.NODE_ENV === "development") {
    return true;
  }
  return process.env.ENABLE_N8N_DEV_TOOLS === "true";
}
