import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_ROUTES = ["/login", "/signup", "/forgot-password"];
const PUBLIC_ROUTES = [...AUTH_ROUTES, "/onboarding"];
const TRIAL_ALLOWED_ROUTES = ["/billing", "/settings"];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  // Allow API routes through — they handle their own auth
  if (pathname.startsWith("/api")) {
    return supabaseResponse;
  }

  // Not authenticated — redirect to login for protected routes
  if (!user && !PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
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

  // Consolidated account checks for authenticated users
  if (user) {
    const { data: account } = await supabase
      .from("accounts")
      .select("trial_ends_at, plan_slug, onboarding_done_at")
      .single();

    if (account) {
      // Onboarding gate — force incomplete onboarding to /onboarding
      if (!account.onboarding_done_at && !pathname.startsWith("/onboarding")) {
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

      if (trialExpired && isTrialPlan && !isAllowedRoute) {
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
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
