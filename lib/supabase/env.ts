const isProduction = process.env.NODE_ENV === "production";

function handleInvalidEnv(name: string, reason: string): never {
  const message = `[Vector48] Invalid ${name}: ${reason}`;

  if (isProduction) {
    console.error(`[Vector48] Invalid ${name}. Check environment variable formatting.`);
    throw new Error(`[Vector48] Missing or invalid Supabase configuration.`);
  }

  throw new Error(`${message}.`);
}

function sanitizePublicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
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

export function getSupabasePublicEnv() {
  return {
    url: sanitizePublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: sanitizePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}
