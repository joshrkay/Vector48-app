// ---------------------------------------------------------------------------
// Supabase Admin Client (service-role)
// Server-only: uses SUPABASE_SERVICE_ROLE_KEY — never import in client code.
// Use this when cookie-based auth is unavailable (e.g., webhooks, cron jobs).
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
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.",
    );
  }

  adminClient = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return adminClient;
}
