"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const supabase = createClient();

    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) {
      console.error("[auth/callback] provider error:", params.get("error"), params.get("error_description"));
      window.location.href = "/auth/login?error=oauth_failed";
      return;
    }

    const hash = window.location.hash.slice(1);
    const hashParams = new URLSearchParams(hash);
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (!accessToken || !refreshToken) {
      console.error("[auth/callback] no tokens in URL fragment");
      window.location.href = "/auth/login?error=oauth_failed";
      return;
    }

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(async ({ data, error }) => {
        if (error || !data.session) {
          console.error("[auth/callback] setSession failed:", error?.message);
          window.location.href = "/auth/login?error=oauth_failed";
          return;
        }

        const userId = data.session.user.id;
        const email = data.session.user.email ?? "";
        const displayName = (data.session.user.user_metadata?.display_name as string) ?? "";
        console.log("[auth/callback] session established for:", email);

        let destination = "/dashboard";
        try {
          const { syncZohoRole } = await import("@/app/(auth)/sync-zoho-role");
          const role = await syncZohoRole(userId, email, displayName);
          if (!role || role === "pending") destination = "/auth/pending";
        } catch (err) {
          console.warn("[auth/callback] syncZohoRole error:", err);
        }

        window.location.href = destination;
      });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f4f1]">
      <div className="flex flex-col items-center gap-3">
        <svg className="w-5 h-5 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-[13px] text-slate-400">Verifying your account…</p>
      </div>
    </div>
  );
}
