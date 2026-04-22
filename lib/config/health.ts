import { getSupabasePublicEnv, SupabaseConfigError } from "@/lib/supabase/env";

export type ConfigHealthScope =
  | "supabase_public_env"
  | "required_server_env";

type ConfigHealthResult =
  | { ok: true }
  | {
      ok: false;
      code: "CONFIG_ERROR";
      message: string;
      scope: ConfigHealthScope;
      missing?: string[];
    };

// Env vars that must be set for the server to function. Missing any of these
// means the app will silently 500 on the first request that needs it, so we
// fail at startup instead.
const REQUIRED_SERVER_ENV_VARS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "GHL_CLIENT_ID",
  "GHL_CLIENT_SECRET",
  "GHL_OAUTH_REDIRECT_URI",
  "GHL_TOKEN_ENCRYPTION_KEY",
  "GHL_WEBHOOK_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "ANTHROPIC_API_KEY",
  "N8N_API_KEY",
  "N8N_BASE_URL",
  "N8N_WEBHOOK_BASE_URL",
  "RECIPE_EXECUTION_SECRET",
  "CRON_SECRET",
  "NEXT_PUBLIC_APP_URL",
] as const;

function validateRequiredServerEnv(): ConfigHealthResult {
  const missing: string[] = [];
  for (const name of REQUIRED_SERVER_ENV_VARS) {
    const raw = process.env[name];
    if (!raw || !raw.trim()) {
      missing.push(name);
    }
  }

  if (missing.length === 0) return { ok: true };

  return {
    ok: false,
    code: "CONFIG_ERROR",
    message: `Missing required server env vars: ${missing.join(", ")}`,
    scope: "required_server_env",
    missing,
  };
}

export function validateCriticalConfig(): ConfigHealthResult {
  try {
    getSupabasePublicEnv();
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
        scope: "supabase_public_env",
      };
    }

    return {
      ok: false,
      code: "CONFIG_ERROR",
      message: "Unknown configuration validation error",
      scope: "supabase_public_env",
    };
  }

  return validateRequiredServerEnv();
}
