import { createBrowserClient as _createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

let client: ReturnType<typeof _createBrowserClient<Database>> | null = null;

export function createBrowserClient() {
  if (client) return client;

  client = _createBrowserClient<Database>(
    // NEXT_PUBLIC_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // NEXT_PUBLIC_SUPABASE_ANON_KEY
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  return client;
}
