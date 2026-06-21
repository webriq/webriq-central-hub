"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, Mail, Lock, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/auth/theme-toggle";
import { V2_ROUTES } from "@/config/constants";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "oauth_failed" ? "Zoho sign-in failed. Please try again." : null
  );
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function safeReturnTo(value: string | null): string {
    return value && value.startsWith("/v2/") ? value : V2_ROUTES.DASHBOARD;
  }

  function handleZohoSignIn() {
    const returnTo = searchParams.get("returnTo");
    const callbackUrl = returnTo
      ? `${window.location.origin}/v2/callback?returnTo=${encodeURIComponent(returnTo)}`
      : `${window.location.origin}/v2/callback`;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    window.location.href = `${supabaseUrl}/auth/v1/authorize?provider=custom%3Azoho&redirect_to=${encodeURIComponent(callbackUrl)}`;
  }

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

    router.push(safeReturnTo(searchParams.get("returnTo")));
    router.refresh();
  }

  return (
    <div className="min-h-dvh w-full lg:grid lg:grid-cols-2 bg-background">
      <ThemeToggle />

      {/* ── Left: Hero panel (desktop only) ──────────────────────────────── */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden p-10 text-white">
        <Image
          src="/auth-hero-BN2J7r2Q.jpg"
          alt=""
          fill
          sizes="(min-width: 1024px) 50vw, 0vw"
          className="object-cover opacity-70"
          priority
        />
        {/* Hardcoded-dark overlays — hero always stays dark regardless of theme */}
        <div className="absolute inset-0 bg-black/85" />
        <div className="absolute inset-0 bg-linear-to-tr from-brand-orange/40 via-transparent to-brand-orange/10 mix-blend-screen" />
        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent" />

        {/* Logo */}
        <Link href="/" className="relative z-10 inline-flex items-center gap-2.5 font-semibold tracking-tight">
          <Image src="/logo.png" alt="WebriQ" width={40} height={40} className="h-10 w-10 object-contain" />
          <span className="text-lg">WebriQ <span className="text-brand-orange">Central Hub</span></span>
        </Link>

        {/* Testimonial */}
        <div className="relative z-10 max-w-md space-y-5">
          <p className="text-[1.75rem] font-medium leading-snug tracking-tight text-balance">
            A workspace where ideas turn into shipped products — without the busywork.
          </p>
          <div className="flex items-center gap-3">
            <div
              className="bg-brand-orange h-10 w-10 rounded-full shrink-0 ring-1 ring-white/20"
            />
            <div className="text-sm">
              <p className="font-semibold">Mira Chen</p>
              <p className="text-white/60">Product Lead, Northwind</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: Form panel ─────────────────────────────────────────────── */}
      <div className="relative flex min-h-dvh flex-col lg:items-center lg:justify-center lg:px-10 lg:py-12">

        {/* Mobile: gradient header */}
        <div
          className="relative lg:hidden overflow-hidden px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-16 text-white bg-[linear-gradient(140deg,#07111f_0%,#0c1b38_55%,#070E1F_100%)]"
        >
          <div className="absolute -top-24 -right-16 h-64 w-64 rounded-full bg-primary/35 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-brand-orange/25 blur-3xl pointer-events-none" />
          <Link href="/" className="relative z-10 inline-flex items-center gap-2 font-semibold tracking-tight">
            <Image src="/logo.png" alt="WebriQ" width={36} height={36} className="h-9 w-9 object-contain" />
            <span className="text-base">WebriQ <span className="text-brand-orange">Central Hub</span></span>
          </Link>
          <div className="relative z-10 mt-8 space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
            <p className="text-white/60 text-sm">Sign in to your account to continue.</p>
          </div>
        </div>

        {/* Form card — slides over mobile header, flat on desktop */}
        <div className="relative z-10 -mt-10 flex-1 rounded-t-3xl bg-background px-6 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-[0_-24px_40px_-16px_rgba(0,0,0,0.5)] lg:mt-0 lg:flex-initial lg:w-full lg:max-w-md lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none">

          {/* Mobile drag handle */}
          <div className="lg:hidden mx-auto mb-6 h-1.5 w-10 rounded-full bg-muted" />

          {/* Desktop heading */}
          <div className="hidden lg:block mb-8 space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">Welcome back</h1>
            <p className="text-muted-foreground">Sign in to your account to continue.</p>
          </div>

          {/* Zoho SSO */}
          <div className="mb-6">
            <button
              type="button"
              onClick={handleZohoSignIn}
              className="inline-flex items-center justify-center gap-2.5 h-12 w-full rounded-md border border-brand-orange/30 bg-card font-semibold text-foreground text-sm cursor-pointer transition-colors hover:bg-brand-orange/10 hover:border-brand-orange/50"
            >
              <Image
                src="/zoho-logo-512.png"
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 object-contain shrink-0"
              />
              Continue with Zoho
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground mb-6">
            <div className="h-px flex-1 bg-border" />
            or continue with email
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Email / password form */}
          <form onSubmit={handleSubmit} className="space-y-5">

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium leading-none text-foreground">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex w-full h-12 rounded-md border border-input bg-transparent pl-11 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-orange"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium leading-none text-foreground">
                  Password
                </label>
                <a href="#" className="text-sm font-medium text-brand-orange hover:text-brand-orange/80 transition-colors">
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex w-full h-12 rounded-md border border-input bg-transparent pl-11 pr-10 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-orange"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  {showPassword
                    ? <EyeOff className="h-4 w-4" aria-hidden />
                    : <Eye className="h-4 w-4" aria-hidden />
                  }
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg px-4 py-2.5 text-sm text-destructive bg-destructive/10 border border-destructive/20">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group inline-flex items-center justify-center gap-2 h-12 w-full rounded-md bg-brand-orange text-white font-semibold text-sm shadow cursor-pointer hover:bg-brand-orange/90 transition-all disabled:opacity-60 disabled:pointer-events-none"
            >
              {loading ? "Signing in…" : "Sign in"}
              {!loading && (
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href={V2_ROUTES.AUTH_SIGNUP} className="font-semibold text-foreground hover:text-brand-orange transition-colors">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
