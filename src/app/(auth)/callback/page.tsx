"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const called = useRef(false);

  useEffect(() => {
    // React StrictMode runs effects twice in dev — guard against double execution
    // which would burn the refresh token on the second call.
    if (called.current) return;
    called.current = true;

    const supabase = createClient();

    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) {
      console.error("[auth/callback] provider error:", params.get("error"), params.get("error_description"));
      router.push("/signin?error=oauth_failed");
      return;
    }

    // Supabase custom OIDC uses implicit flow — tokens land in the URL fragment.
    // The JS client defaults to PKCE and ignores the fragment, so we parse and
    // call setSession() directly.
    const hash = window.location.hash.slice(1);
    const hashParams = new URLSearchParams(hash);
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (!accessToken || !refreshToken) {
      console.error("[auth/callback] no tokens in URL fragment — hash:", window.location.hash);
      router.push("/signin?error=oauth_failed");
      return;
    }

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ data, error }) => {
        if (error) {
          console.error("[auth/callback] setSession error:", error.message, error);
          router.push("/signin?error=oauth_failed");
          return;
        }
        if (!data.session) {
          console.error("[auth/callback] setSession returned no session, data:", data);
          router.push("/signin?error=oauth_failed");
          return;
        }
        console.log("[auth/callback] session established for:", data.session.user.email);
        router.push("/");
        router.refresh();
      });
  }, [router]);

  return (
    <div className="flex items-center justify-center py-12">
      <p className="text-sm text-muted-foreground">Completing sign-in…</p>
    </div>
  );
}
