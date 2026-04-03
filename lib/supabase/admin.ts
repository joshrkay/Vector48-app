// ---------------------------------------------------------------------------
// Supabase Admin Client — bypasses RLS using service role key.
// Use for background jobs that run outside a user request context.
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import { sanitizeSupabaseServiceRoleKey, sanitizeSupabaseUrl } from "./env";
import type { Database } from "./types";

let adminClient: ReturnType<typeof createClient<Database>> | null = null;

export function createAdminClient() {
  if (adminClient) return adminClient;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for admin client.",
    );
  }

  const url = sanitizeSupabaseUrl();
  const key = sanitizeSupabaseServiceRoleKey();

  adminClient = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return adminClient;
}

/** Alias for backward compatibility with imports that use getSupabaseAdmin. */
export const getSupabaseAdmin = createAdminClient;
