"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, Lock, ArrowRight, Check } from "lucide-react";
import { ThemeToggle } from "@/components/auth/theme-toggle";
import { confirmPasswordChange } from "@/app/v2/(auth)/actions";

// ── Password strength ─────────────────────────────────────────────────────────

type Strength = 0 | 1 | 2 | 3;

function getStrength(pwd: string): Strength | null {
  if (!pwd) return null;
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 1) return 0;
  if (score === 2) return 1;
  if (score === 3) return 2;
  return 3;
}

const STRENGTH_META: Record<Strength, { label: string; filled: number; bar: string; text: string }> = {
  0: { label: "Too weak", filled: 1, bar: "bg-brand-orange/60", text: "text-muted-foreground" },
  1: { label: "Okay",     filled: 2, bar: "bg-brand-orange",    text: "text-brand-orange" },
  2: { label: "Good",     filled: 3, bar: "bg-brand-orange",    text: "text-brand-orange" },
  3: { label: "Strong",   filled: 4, bar: "bg-green-500",       text: "text-green-500" },
};

function PasswordStrength({ password }: { password: string }) {
  const strength = getStrength(password);
  if (strength === null) return null;
  const { label, filled, bar, text } = STRENGTH_META[strength];
  return (
    <div className="mt-2 space-y-1.5">
      <div className="grid grid-cols-4 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i < filled ? bar : "bg-border"}`} />
        ))}
      </div>
      <p className={`flex items-center gap-1 text-xs font-medium ${text}`}>
        <Check className="h-3 w-3" aria-hidden />
        {label}
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ChangePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const result = await confirmPasswordChange(password);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    router.push("/v2/dashboard");
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
        <div className="absolute inset-0 bg-black/85" />
        <div className="absolute inset-0 bg-linear-to-tr from-brand-orange/40 via-transparent to-brand-orange/10 mix-blend-screen" />
        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent" />

        <Link href="/" className="relative z-10 inline-flex items-center gap-2.5 font-semibold tracking-tight">
          <Image src="/logo.png" alt="WebriQ" width={40} height={40} className="h-10 w-10 object-contain" />
          <span className="text-lg">WebriQ <span className="text-brand-orange">Central Hub</span></span>
        </Link>

        <div className="relative z-10 max-w-md space-y-5">
          <p className="text-[1.75rem] font-medium leading-snug tracking-tight text-balance">
            A workspace where ideas turn into shipped products — without the busywork.
          </p>
          <div className="flex items-center gap-3">
            <div className="bg-brand-orange h-10 w-10 rounded-full shrink-0 ring-1 ring-white/20" />
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
        <div className="relative lg:hidden overflow-hidden px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-16 text-white bg-[linear-gradient(140deg,#07111f_0%,#0c1b38_55%,#070E1F_100%)]">
          <div className="absolute -top-24 -right-16 h-64 w-64 rounded-full bg-primary/35 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-brand-orange/25 blur-3xl pointer-events-none" />
          <Link href="/" className="relative z-10 inline-flex items-center gap-2 font-semibold tracking-tight">
            <Image src="/logo.png" alt="WebriQ" width={36} height={36} className="h-9 w-9 object-contain" />
            <span className="text-base">WebriQ <span className="text-brand-orange">Central Hub</span></span>
          </Link>
          <div className="relative z-10 mt-8 space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Set your password</h1>
            <p className="text-white/60 text-sm">Choose a new password to secure your account.</p>
          </div>
        </div>

        {/* Form card */}
        <div className="relative z-10 -mt-10 flex-1 rounded-t-3xl bg-background px-6 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-[0_-24px_40px_-16px_rgba(0,0,0,0.5)] lg:mt-0 lg:flex-initial lg:w-full lg:max-w-md lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none">

          <div className="lg:hidden mx-auto mb-6 h-1.5 w-10 rounded-full bg-muted" />

          <div className="hidden lg:block mb-8 space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">Set your password</h1>
            <p className="text-muted-foreground">Choose a new password to secure your account.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium leading-none text-foreground">
                New password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  placeholder="At least 8 characters"
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
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
              <PasswordStrength password={password} />
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium leading-none text-foreground">
                Confirm password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="flex w-full h-12 rounded-md border border-input bg-transparent pl-11 pr-10 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-orange"
                />
                <button
                  type="button"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
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
              {loading ? "Saving…" : "Set password"}
              {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
