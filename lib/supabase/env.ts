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

const SUPABASE_URL_REASON_CODES = {
  INVALID_URL: "SUPABASE_URL_INVALID_FORMAT",
  INVALID_PROTOCOL: "SUPABASE_URL_INVALID_PROTOCOL",
  INVALID_HOSTNAME: "SUPABASE_URL_INVALID_HOSTNAME",
  QUOTED_VALUE: "SUPABASE_URL_SURROUNDING_QUOTES",
} as const;

const SUPABASE_PROJECT_DOMAIN_PATTERN = /^[a-z0-9-]+\.supabase\.co$/;

function validateSupabaseUrlFormat(urlValue: string): string | null {
  if (
    (urlValue.startsWith('"') && urlValue.endsWith('"')) ||
    (urlValue.startsWith("'") && urlValue.endsWith("'")) ||
    (urlValue.startsWith("`") && urlValue.endsWith("`"))
  ) {
    return SUPABASE_URL_REASON_CODES.QUOTED_VALUE;
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(urlValue);
  } catch {
    return SUPABASE_URL_REASON_CODES.INVALID_URL;
  }

  if (parsedUrl.protocol !== "https:") {
    return SUPABASE_URL_REASON_CODES.INVALID_PROTOCOL;
  }

  if (!SUPABASE_PROJECT_DOMAIN_PATTERN.test(parsedUrl.hostname)) {
    return SUPABASE_URL_REASON_CODES.INVALID_HOSTNAME;
  }

  return null;
}

export function sanitizeSupabaseUrl() {
  const sanitizedUrl = sanitizeSupabaseEnv("NEXT_PUBLIC_SUPABASE_URL");
  const reasonCode = validateSupabaseUrlFormat(sanitizedUrl);

  if (reasonCode) {
    handleInvalidEnv("NEXT_PUBLIC_SUPABASE_URL", reasonCode);
  }

  return sanitizedUrl;
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
