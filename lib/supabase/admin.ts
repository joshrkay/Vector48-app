// ---------------------------------------------------------------------------
// Supabase Admin Client — Service role singleton for server-side operations
// that don't have a user session (webhooks, background jobs, etc.).
// Bypasses RLS — use only in trusted server contexts.
// ---------------------------------------------------------------------------

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _client;
}
