import { createServerClient as _createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";
import { getSupabasePublicEnv } from "./env";

export async function createServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabasePublicEnv();

  return _createServerClient<Database>(
    // NEXT_PUBLIC_SUPABASE_URL
    url,
    // NEXT_PUBLIC_SUPABASE_ANON_KEY
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method is called from a Server Component.
            // This can be ignored if middleware refreshes user sessions.
          }
        },
      },
    }
  );
}
