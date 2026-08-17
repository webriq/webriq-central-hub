import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // Skip session refresh if Supabase isn't configured yet (local dev without .env.local)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return NextResponse.next({ request });
  }

  // Forward the requested path to server components so auth guards can build ?returnTo=
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

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
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired — getClaims validates JWT signature against project keys
  await supabase.auth.getClaims();

  // Task 255 — hub pages now live at root alongside auth/public/API routes (no more
  // /v2/ prefix to distinguish them), so this gate excludes the known non-hub prefixes
  // instead of matching a hub-specific one.
  const pathname = request.nextUrl.pathname;
  const nonHubPrefixes = ["/auth/", "/api/", "/callback", "/onboarding"];
  const isHubRoute = pathname !== "/" && !nonHubPrefixes.some((prefix) => pathname.startsWith(prefix));

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
