"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { postLoginGate } from "@/app/v2/(auth)/actions";
import { AuthSplitShell } from "@/components/auth/auth-split-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { AuthErrorBanner } from "@/components/auth/auth-error-banner";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { getOrCreateDeviceId } from "@/lib/auth/device-id";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!email || !password) {
      setError("Email and password are required.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Generate or read device ID for OTP step-up
    const deviceId = getOrCreateDeviceId();

    const { redirect: dest, error: gateError, warning: gateWarning } = await postLoginGate(deviceId, searchParams.get("returnTo") ?? undefined);
    if (gateError) {
      setError(gateError);
      setLoading(false);
      return;
    }
    router.push(gateWarning ? `${dest}?emailWarning=${encodeURIComponent(gateWarning)}` : dest);
  }

  return (
    <AuthSplitShell title="Welcome back" subtitle="Sign in to your account to continue.">
      <form onSubmit={handleSubmit} className="space-y-5">

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-semibold leading-none text-foreground pb-5">
            Email
          </label>
          <div className="relative">
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="peer flex w-full h-12 rounded-md border border-input bg-transparent pl-11 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-auth-blue focus-visible:ring-offset-2"
            />
            {/* Must follow the input in DOM order — Tailwind's peer-focus (CSS `~`) only
                matches siblings after .peer; absolute positioning keeps it visually on the left. */}
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground peer-focus:text-auth-blue transition-colors" aria-hidden />
          </div>
        </div>

        <PasswordInput
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          placeholder="Enter your password"
          headerAction={
            <Link href="/v2/auth/forgot-password" className="text-sm font-semibold text-auth-blue-700 hover:text-auth-blue transition-colors">
              Forgot password?
            </Link>
          }
        />

        <AuthErrorBanner message={error} />

        <AuthSubmitButton loading={loading} loadingLabel="Signing in…" label="Sign in" />
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Contact your administrator to get access.
      </p>
    </AuthSplitShell>
  );
}
