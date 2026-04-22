import { validateCriticalConfig } from "@/lib/config/health";

declare global {
  // eslint-disable-next-line no-var
  var __vector48ConfigAlerted: boolean | undefined;
}

export async function register() {
  const health = validateCriticalConfig();
  if (health.ok) {
    return;
  }

  if (!globalThis.__vector48ConfigAlerted) {
    globalThis.__vector48ConfigAlerted = true;
    console.error("[Vector48][HIGH] Critical config validation failed at startup.", {
      code: health.code,
      scope: health.scope,
      message: health.message,
      missing: "missing" in health ? health.missing : undefined,
    });
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(`[Vector48] Startup config check failed (${health.code}).`);
  }
}

