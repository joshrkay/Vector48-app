import { createBrowserClient as _createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";
import { getSupabasePublishableKey } from "./publishableKey";

let client: ReturnType<typeof _createBrowserClient<Database>> | null = null;

export function createBrowserClient() {
  if (client) return client;

  if (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("fake.supabase.co")
  ) {
    console.warn(
      "[Vector48] NEXT_PUBLIC_SUPABASE_URL is the E2E placeholder. Copy .env.local.example to .env.local and set your real Supabase URL and anon or publishable key (Project Settings → API).",
    );
  }

  client = _createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublishableKey()
  );

  return client;
}
