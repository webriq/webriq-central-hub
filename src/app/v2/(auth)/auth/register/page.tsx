"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, ArrowRight } from "lucide-react";
import { registerFromInvite } from "@/app/v2/(auth)/actions";
import { createClient } from "@/lib/supabase/client";
import { AuthSplitShell } from "@/components/auth/auth-split-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { PasswordStrength } from "@/components/auth/password-strength-meter";
import { AuthErrorBanner } from "@/components/auth/auth-error-banner";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { getOrCreateDeviceId } from "@/lib/auth/device-id";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionState, setSessionState] = useState<"loading" | "ready" | "error">("loading");
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    async function initSession() {
      // Primary flow: token_hash in query string (direct invite URL, no Supabase redirect needed)
      const searchParams = new URLSearchParams(window.location.search);
      const tokenHash = searchParams.get("token_hash");
      const otpType = searchParams.get("type");

      if (tokenHash && otpType === "recovery") {
        const { data, error: verifyErr } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });
        if (verifyErr || !data.session) {
          setSessionState("error");
          setError("This invite link is invalid or has expired. Contact your administrator for a new one.");
          return;
        }
        setEmail(data.session.user.email ?? "");
        setSessionState("ready");
        window.history.replaceState(null, "", window.location.pathname);
        return;
      }

      // Legacy flow: access_token + refresh_token in URL hash (old invite links)
      const hash = window.location.hash.slice(1);
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (accessToken && refreshToken) {
        const { data, error: sessionErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionErr || !data.session) {
          setSessionState("error");
          setError("This invite link is invalid or has expired. Contact your administrator for a new one.");
          return;
        }
        setEmail(data.session.user.email ?? "");
        setSessionState("ready");
        window.history.replaceState(null, "", window.location.pathname);
        return;
      }

      // No tokens — check for existing session (user refreshed the page)
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setEmail(session.user.email ?? "");
        setSessionState("ready");
        return;
      }

      setSessionState("error");
      setError("This invite link is invalid or has expired. Contact your administrator for a new one.");
    }

    initSession();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const deviceId = getOrCreateDeviceId();

    const result = await registerFromInvite(password, deviceId);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.push(result.redirect ?? "/v2/auth/verify");
  }

  if (sessionState === "loading") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-auth-blue border-t-transparent" />
          <p className="text-sm text-muted-foreground">Setting up your account…</p>
        </div>
      </div>
    );
  }

  return (
    <AuthSplitShell title="Complete your registration" subtitle="Set a password to activate your account.">
      {sessionState === "error" ? (
        <div className="space-y-4">
          <AuthErrorBanner message={error} />
          <Link
            href="/v2/auth/login"
            className="inline-flex items-center gap-2 text-sm font-semibold text-auth-blue-700 hover:text-auth-blue transition-colors"
          >
            <ArrowRight className="h-4 w-4 rotate-180" aria-hidden />
            Back to login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Email — read only */}
          <div className="space-y-3">
            <label htmlFor="email" className="text-xs font-semibold leading-none text-foreground">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                id="email"
                type="email"
                value={email}
                readOnly
                className="flex w-full h-12 rounded-md border border-input bg-muted/50 pl-11 pr-3 text-sm text-muted-foreground cursor-not-allowed"
              />
            </div>
          </div>

          <PasswordInput
            id="password"
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            hint={<PasswordStrength password={password} />}
          />

          <PasswordInput
            id="confirmPassword"
            label="Confirm password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            placeholder="Repeat your password"
          />

          <AuthErrorBanner message={error} />

          <AuthSubmitButton loading={loading} loadingLabel="Activating account…" label="Activate account" />
        </form>
      )}
    </AuthSplitShell>
  );
}
