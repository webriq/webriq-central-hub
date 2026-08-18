import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // Skip session refresh if Supabase isn't configured yet (local dev without .env.local)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return NextResponse.next({ request });
  }

  // Forward the requested path to server components so auth guards can build ?returnTo=
  const pathnameValue = request.nextUrl.pathname + request.nextUrl.search;

  // Builds the forwarded-request headers from the CURRENT request.headers (not a snapshot
  // taken before any cookie refresh) so a mid-request token refresh — triggered below by
  // getClaims() — is visible to this same request's Server Components, not just the next
  // navigation. Task 262: reusing a pre-refresh clone here caused Server Components to see
  // an expired session cookie and bounce to /auth/login right after a successful refresh.
  function buildForwardedHeaders(): Headers {
    const headers = new Headers(request.headers);
    headers.set("x-pathname", pathnameValue);
    return headers;
  }

  let supabaseResponse = NextResponse.next({ request: { headers: buildForwardedHeaders() } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request: { headers: buildForwardedHeaders() } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired — getClaims validates JWT signature against project keys
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = !!data?.claims;

  // Task 255 — hub pages now live at root alongside auth/public/API routes (no more
  // /v2/ prefix to distinguish them), so this gate excludes the known non-hub prefixes
  // instead of matching a hub-specific one.
  const pathname = request.nextUrl.pathname;
  const nonHubPrefixes = ["/auth/", "/api/", "/callback", "/onboarding"];
  const isHubRoute = pathname !== "/" && !nonHubPrefixes.some((prefix) => pathname.startsWith(prefix));

  // Already authenticated users shouldn't land back on the login form. Scoped to GET only —
  // the login form's own postLoginGate Server Action POSTs to this same /auth/login URL right
  // after signInWithPassword sets the session cookie, so a method-agnostic check here would
  // hijack that in-flight action and break the login redirect (task 269).
  if (request.method === "GET" && pathname === "/auth/login" && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Unauthenticated users can't reach hub routes — bounce to login with a returnTo so the
  // post-login gate (postLoginGate) can send them back to what they asked for.
  if (isHubRoute && !isAuthenticated) {
    return NextResponse.redirect(new URL(`/auth/login?returnTo=${encodeURIComponent(pathnameValue)}`, request.url));
  }

  if (isHubRoute) {
    if (request.cookies.get("change_password_required")?.value) {
      return NextResponse.redirect(new URL("/auth/change-password", request.url));
    }
    if (request.cookies.get("mfa_pending")?.value) {
      return NextResponse.redirect(new URL("/auth/verify", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Static files under public/ (e.g. /assets/team-work.lottie, /logo.png, /company_logo.webp)
    // must never hit the proxy: when a hub-gate cookie (mfa_pending, change_password_required)
    // is set, the isHubRoute redirect above would hijack the asset request and return the
    // redirected page's HTML instead of the file — e.g. corrupting the auth-verify Lottie fetch.
    // Excluding any path whose last segment has a file extension covers all of those generically.
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|workbox-.*\\.js|.*\\.[a-zA-Z0-9]+$).*)",
  ],
};
