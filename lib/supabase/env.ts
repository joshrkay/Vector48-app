const isProduction = process.env.NODE_ENV === "production";

export class SupabaseConfigError extends Error {
  readonly code = "CONFIG_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigError";
  }
}

function handleInvalidEnv(name: string, reason: string): never {
  const reasonDetails: Record<string, string> = {
    missing: "value is missing",
    leading_trailing_whitespace: "remove leading/trailing spaces or newlines",
    contains_whitespace: "value must be a single line with no whitespace",
  };
  const reasonMessage = reasonDetails[reason] ?? reason;
  const message = `[Vector48] Invalid ${name}: ${reasonMessage}`;

  if (isProduction) {
    console.error(`[Vector48] Invalid ${name}. Check environment variable formatting.`, {
      envVar: name,
      reasonCode: reason,
    });
    throw new SupabaseConfigError(`[Vector48] Missing or invalid Supabase configuration.`);
  }

  throw new SupabaseConfigError(`${message}.`);
}

function sanitizeSupabaseEnv(
  name:
    | "NEXT_PUBLIC_SUPABASE_URL"
    | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    | "SUPABASE_SERVICE_ROLE_KEY",
) {
  const rawValue = process.env[name];

  if (!rawValue) {
    handleInvalidEnv(name, "missing");
  }

  const trimmedValue = rawValue.trim();

  if (rawValue !== trimmedValue) {
    handleInvalidEnv(name, "leading_trailing_whitespace");
  }

  if (/\s/.test(trimmedValue)) {
    handleInvalidEnv(name, "contains_whitespace");
  }

  return trimmedValue;
}

export function sanitizeSupabaseUrl() {
  return sanitizeSupabaseEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function sanitizeSupabaseAnonKey() {
  return sanitizeSupabaseEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function sanitizeSupabaseServiceRoleKey() {
  return sanitizeSupabaseEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function getSupabasePublicEnv() {
  return {
    url: sanitizeSupabaseUrl(),
    anonKey: sanitizeSupabaseAnonKey(),
  };
}
