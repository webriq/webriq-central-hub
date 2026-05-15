"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const supabase = createClient();

    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) {
      console.error("[auth/callback] provider error:", params.get("error"), params.get("error_description"));
      router.push("/signin?error=oauth_failed");
      return;
    }

    const hash = window.location.hash.slice(1);
    const hashParams = new URLSearchParams(hash);
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const providerToken = hashParams.get("provider_token");

    if (!accessToken || !refreshToken) {
      console.error("[auth/callback] no tokens in URL fragment");
      router.push("/signin?error=oauth_failed");
      return;
    }

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(async ({ data, error }) => {
        if (error || !data.session) {
          console.error("[auth/callback] setSession failed:", error?.message);
          router.push("/signin?error=oauth_failed");
          return;
        }

        const userId = data.session.user.id;
        console.log("[auth/callback] session established for:", data.session.user.email);

        // Fire-and-forget: fetch Zoho profile in background so redirect isn't blocked
        if (providerToken) {
          void (async () => {
            try {
              const zohoRes = await fetch("/api/zoho/user-info", {
                headers: { Authorization: `Bearer ${providerToken}` },
              });
              if (zohoRes.ok) {
                const profile = await zohoRes.json();
                const displayName = profile.Display_Name ?? "";
                const zuid = String(profile.ZUID ?? "");
                if (displayName) {
                  const { updateZohoProfile } = await import(
                    "@/app/(auth)/update-zoho-profile"
                  );
                  await updateZohoProfile(userId, displayName, zuid);
                }
              } else {
                console.warn("[auth/callback] Zoho user/info failed:", zohoRes.status);
              }
            } catch (err) {
              console.warn("[auth/callback] Zoho fetch error:", err);
            }
          })();
        }

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
