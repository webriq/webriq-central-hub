"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Mail } from "lucide-react";
import { ThemeToggle } from "@/components/auth/theme-toggle";
import { verifyOtpCode, postLoginGate } from "@/app/v2/(auth)/actions";

const RESEND_COOLDOWN = 60;

export default function VerifyPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const [resending, setResending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setResendCooldown((n) => {
        if (n <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const deviceId = localStorage.getItem("hub_device_id") ?? "";
    const result = await verifyOtpCode(code.trim(), deviceId);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    router.push("/v2/dashboard");
  }

  async function handleResend() {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    setError(null);

    const deviceId = localStorage.getItem("hub_device_id") ?? "";
    await postLoginGate(deviceId);

    setResendCooldown(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setResendCooldown((n) => {
        if (n <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return n - 1;
      });
    }, 1000);

    setResending(false);
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
            <h1 className="text-3xl font-semibold tracking-tight">Check your email</h1>
            <p className="text-white/60 text-sm">We sent a 6-digit code to your email address.</p>
          </div>
        </div>

        {/* Form card */}
        <div className="relative z-10 -mt-10 flex-1 rounded-t-3xl bg-background px-6 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-[0_-24px_40px_-16px_rgba(0,0,0,0.5)] lg:mt-0 lg:flex-initial lg:w-full lg:max-w-md lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none">

          <div className="lg:hidden mx-auto mb-6 h-1.5 w-10 rounded-full bg-muted" />

          <div className="hidden lg:block mb-8 space-y-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-orange/10 ring-1 ring-brand-orange/20">
                <Mail className="h-6 w-6 text-brand-orange" aria-hidden />
              </div>
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">Check your email</h1>
            <p className="text-muted-foreground">We sent a 6-digit code to your email address.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">

            <div className="space-y-2">
              <label htmlFor="code" className="text-sm font-medium leading-none text-foreground">
                Verification code
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                required
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="flex w-full h-14 rounded-md border border-input bg-transparent px-4 text-center text-2xl font-mono tracking-[0.5em] shadow-sm placeholder:text-muted-foreground/40 placeholder:tracking-normal focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-orange"
              />
            </div>

            {error && (
              <div className="rounded-lg px-4 py-2.5 text-sm text-destructive bg-destructive/10 border border-destructive/20">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="group inline-flex items-center justify-center gap-2 h-12 w-full rounded-md bg-brand-orange text-white font-semibold text-sm shadow cursor-pointer hover:bg-brand-orange/90 transition-all disabled:opacity-60 disabled:pointer-events-none"
            >
              {loading ? "Verifying…" : "Verify code"}
              {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Didn&apos;t receive a code?{" "}
            {resendCooldown > 0 ? (
              <span className="text-muted-foreground/60">Resend in {resendCooldown}s</span>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="font-semibold text-foreground hover:text-brand-orange transition-colors cursor-pointer disabled:opacity-60"
              >
                {resending ? "Sending…" : "Resend code"}
              </button>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
