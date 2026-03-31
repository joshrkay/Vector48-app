import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_ROUTES = ["/login", "/signup"];
const PUBLIC_ROUTES = [...AUTH_ROUTES, "/forgot-password"];
const TRIAL_ALLOWED_ROUTES = ["/billing", "/login", "/signup"];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missingSupabaseEnv =
    typeof supabaseUrl !== "string" ||
    supabaseUrl.length === 0 ||
    typeof supabaseAnonKey !== "string" ||
    supabaseAnonKey.length === 0;

  if (missingSupabaseEnv) {
    console.warn(
      "[middleware] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — add both to .env.local (see .env.local.example).",
    );
    return new NextResponse(
      "Configuration error: Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.\n\n" +
        "Copy .env.local.example to .env.local and set both values from your Supabase project:\n" +
        "https://supabase.com/dashboard/project/_/settings/api\n",
      {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      },
    );
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Allow API routes through
  if (pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  // Not authenticated — redirect to login for protected routes
  if (
    !user &&
    !PUBLIC_ROUTES.some((r) => pathname.startsWith(r)) &&
    !pathname.startsWith("/onboarding")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Authenticated — redirect away from auth routes
  if (user && AUTH_ROUTES.some((r) => pathname.startsWith(r))) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Consolidated account checks for authenticated users on app routes
  if (user && !PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    const { data: account } = await supabase
      .from("accounts")
      .select("trial_ends_at, plan_slug, onboarding_completed_at")
      .single();

    if (account) {
      // Onboarding gate — force incomplete onboarding to /onboarding
      if (!account.onboarding_completed_at && !pathname.startsWith("/onboarding")) {
        const url = request.nextUrl.clone();
        url.pathname = "/onboarding";
        return NextResponse.redirect(url);
      }

      // Trial expiry check
      const trialExpired =
        account.trial_ends_at &&
        new Date(account.trial_ends_at) < new Date();
      const isTrialPlan = account.plan_slug === "trial";
      const isAllowedRoute = TRIAL_ALLOWED_ROUTES.some((r) =>
        pathname.startsWith(r)
      );

      if (
        trialExpired &&
        isTrialPlan &&
        !isAllowedRoute &&
        !pathname.startsWith("/onboarding")
      ) {
        const url = request.nextUrl.clone();
        url.pathname = "/billing";
        url.searchParams.set("reason", "trial_expired");
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
