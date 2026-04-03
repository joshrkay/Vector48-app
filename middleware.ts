import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_ROUTES = ["/login", "/signup", "/forgot-password"];
const PUBLIC_ROUTES = [...AUTH_ROUTES, "/onboarding", "/reset-password"];
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

  // Refresh session — if the Supabase network call fails (e.g. ECONNRESET),
  // fall back to passing the request through rather than crashing the page.
  let user: { id: string } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    console.error("[middleware] supabase.auth.getUser failed:", err);
    return supabaseResponse; // let the request through; page-level auth will catch it
  }

  const pathname = request.nextUrl.pathname;

  // Allow API routes through — they handle their own auth
  if (pathname.startsWith("/api")) {
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
    let account: {
      trial_ends_at: string | null;
      plan_slug: string | null;
      onboarding_completed_at: string | null;
      ghl_provisioning_status: string | null;
    } | null = null;

    try {
      const { data } = await supabase
        .from("accounts")
        .select(
          "trial_ends_at, plan_slug, onboarding_completed_at, ghl_provisioning_status",
        )
        .eq("owner_user_id", user.id)
        .maybeSingle();
      account = data;
    } catch (err) {
      console.error("[middleware] accounts fetch failed:", err);
      return supabaseResponse; // let the request through on DB errors
    }

    const onboardingComplete =
      Boolean(account?.onboarding_completed_at) ||
      account?.ghl_provisioning_status === "failed";

    if (!onboardingComplete && !pathname.startsWith("/onboarding")) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    if (account) {
      // Trial expiry check
      const trialExpired =
        account.trial_ends_at &&
        new Date(account.trial_ends_at) < new Date();
      const isTrialPlan = account.plan_slug === "trial";
      const isAllowedRoute = TRIAL_ALLOWED_ROUTES.some((r) =>
        pathname.startsWith(r),
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
