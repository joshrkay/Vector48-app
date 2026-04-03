const isProduction = process.env.NODE_ENV === "production";

export class SupabaseConfigError extends Error {
  readonly code = "CONFIG_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigError";
  }
}

function handleInvalidEnv(name: string, reason: string): never {
  const message = `[Vector48] Invalid ${name}: ${reason}`;

  if (isProduction) {
    console.error(`[Vector48] Invalid ${name}. Check environment variable formatting.`);
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
    handleInvalidEnv(name, "value is missing");
  }

  const trimmedValue = rawValue.trim();

  if (rawValue !== trimmedValue) {
    handleInvalidEnv(name, "remove leading/trailing spaces or newlines");
  }

  if (/\s/.test(trimmedValue)) {
    handleInvalidEnv(name, "value must be a single line with no whitespace");
  }

  return trimmedValue;
}

export function sanitizeSupabaseUrl() {
  const value = sanitizeSupabaseEnv("NEXT_PUBLIC_SUPABASE_URL");

  if (/["']/.test(value)) {
    handleInvalidEnv("NEXT_PUBLIC_SUPABASE_URL", "remove copied quote characters");
  }

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(value)) {
    handleInvalidEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "must exactly match https://<project-ref>.supabase.co",
    );
  }

  return value;
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
