// ---------------------------------------------------------------------------
// Supabase Admin Client — bypasses RLS using service role key.
// Use for background jobs that run outside a user request context.
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

let adminClient: ReturnType<typeof createClient<Database>> | null = null;

export function createAdminClient() {
  if (adminClient) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for admin client.",
    );
  }
  adminClient = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}

/** Alias for backward compatibility with imports that use getSupabaseAdmin. */
export const getSupabaseAdmin = createAdminClient;
