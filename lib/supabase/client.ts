import { createBrowserClient as _createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

let client: ReturnType<typeof _createBrowserClient<Database>> | null = null;

export function createBrowserClient() {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (
    !supabaseUrl ||
    supabaseUrl.includes("fake.supabase.co") ||
    !supabaseUrl.includes(".supabase.co")
  ) {
    console.error(
      "[Vector48] NEXT_PUBLIC_SUPABASE_URL is missing or invalid. " +
        "Set it in .env.local (dev) or Vercel environment variables (production). " +
        "Find it at: Supabase Dashboard → Project Settings → API. " +
        "Note: free-tier projects are paused after 7 days of inactivity and their subdomain stops resolving.",
    );
  }

  client = _createBrowserClient<Database>(
    // NEXT_PUBLIC_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // NEXT_PUBLIC_SUPABASE_ANON_KEY
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  return client;
}
