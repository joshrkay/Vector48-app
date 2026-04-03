import { getSupabasePublicEnv, SupabaseConfigError } from "@/lib/supabase/env";

type ConfigHealthResult =
  | { ok: true }
  | {
      ok: false;
      code: "CONFIG_ERROR";
      message: string;
      scope: "supabase_public_env";
    };

export function validateCriticalConfig(): ConfigHealthResult {
  try {
    getSupabasePublicEnv();
    return { ok: true };
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
}

