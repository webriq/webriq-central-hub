"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail } from "lucide-react";
import { verifyOtpCode, postLoginGate, requestPasswordReset, verifyPasswordResetOtp } from "@/app/v2/(auth)/actions";
import { createClient } from "@/lib/supabase/client";
import { AuthSplitShell } from "@/components/auth/auth-split-shell";
import { AuthErrorBanner } from "@/components/auth/auth-error-banner";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { OtpInput } from "@/components/auth/otp-input";
import { getDeviceId } from "@/lib/auth/device-id";

const RESEND_COOLDOWN = 60;

function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function startCooldownTimer(
  timerRef: React.RefObject<ReturnType<typeof setInterval> | null>,
  setResendCooldown: React.Dispatch<React.SetStateAction<number>>
) {
  if (timerRef.current) clearInterval(timerRef.current);
  timerRef.current = setInterval(() => {
    setResendCooldown((n) => {
      if (n <= 1) {
        if (timerRef.current) clearInterval(timerRef.current);
        return 0;
      }
      return n - 1;
    });
  }, 1000);
}

export default function VerifyPage() {
  const searchParams = useSearchParams();
  const purpose = searchParams.get("purpose") === "reset" ? "reset" : "device";
  const email = searchParams.get("email") ?? "";

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(() => searchParams.get("emailWarning"));
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const [resending, setResending] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  const locked = useMemo(() => {
    if (!lockedUntil) return false;
    return new Date(lockedUntil).getTime() - now > 0;
  }, [lockedUntil, now]);

  useEffect(() => {
    startCooldownTimer(timerRef, setResendCooldown);
    const interval = timerRef.current;
    return () => { if (interval) clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!lockedUntil) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [lockedUntil]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setAttemptsRemaining(null);
    setLoading(true);

    if (purpose === "reset") {
      const result = await verifyPasswordResetOtp(email, code.trim());

      if (result.locked) {
        setLockedUntil(result.lockedUntil ?? null);
        setError(null);
        setLoading(false);
        return;
      }
      if (result.error) {
        setError(result.error);
        setAttemptsRemaining(result.attemptsRemaining ?? null);
        setLoading(false);
        return;
      }
      if (result.hashedToken) {
        const supabase = createClient();
        const { error: sessionErr } = await supabase.auth.verifyOtp({
          token_hash: result.hashedToken,
          type: "recovery",
        });
        if (sessionErr) {
          setError("Could not complete verification. Please try again.");
          setLoading(false);
          return;
        }
        router.push("/v2/auth/change-password");
        return;
      }
      setLoading(false);
      return;
    }

    const deviceId = getDeviceId();
    const result = await verifyOtpCode(code.trim(), deviceId);

    if (result.locked) {
      setLockedUntil(result.lockedUntil ?? null);
      setLoading(false);
      return;
    }
    if (result.error) {
      setError(result.error);
      setAttemptsRemaining(result.attemptsRemaining ?? null);
      setLoading(false);
      return;
    }

    router.push("/v2/dashboard");
  }

  async function handleResend() {
    if (resendCooldown > 0 || resending || locked) return;
    setResending(true);
    setError(null);
    setAttemptsRemaining(null);
    setWarning(null);

    if (purpose === "reset") {
      await requestPasswordReset(email);
    } else {
      const deviceId = getDeviceId();
      const result = await postLoginGate(deviceId);
      if (result.locked) setLockedUntil(result.lockedUntil ?? null);
      else if (result.error) setError(result.error);
      else if (result.warning) setWarning(result.warning);
    }

    setResendCooldown(RESEND_COOLDOWN);
    startCooldownTimer(timerRef, setResendCooldown);

    setResending(false);
  }

  const remainingMs = lockedUntil ? new Date(lockedUntil).getTime() - now : 0;

  return (
    <AuthSplitShell
      title="Check your email"
      subtitle="We sent a 6-digit code to your email address."
      headingIcon={
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-auth-blue/10 ring-1 ring-auth-blue/20">
            <Mail className="h-6 w-6 text-auth-blue" aria-hidden />
          </div>
        </div>
      }
    >
      {locked ? (
        <AuthErrorBanner
          message="Too many incorrect attempts. Your account is temporarily locked."
          suffix={
            <>
              Try again in <span className="font-mono font-semibold">{formatCountdown(remainingMs)}</span>, or contact a Super Admin to unlock it.
            </>
          }
        />
      ) : (
        <>
          <form onSubmit={handleSubmit} className="space-y-5">

            <div className="space-y-3">
              <p className="text-xs font-semibold leading-none text-foreground">
                Verification code
              </p>
              <OtpInput value={code} onChange={setCode} error={!!error} disabled={loading} />
            </div>

            <AuthErrorBanner
              message={error}
              suffix={
                attemptsRemaining !== null && attemptsRemaining > 0
                  ? `${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} remaining.`
                  : undefined
              }
            />

            <AuthSubmitButton
              loading={loading}
              loadingLabel="Verifying…"
              label="Verify code"
              disabled={loading || code.length < 6}
            />
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
                className="font-semibold text-foreground hover:text-auth-blue-700 transition-colors cursor-pointer disabled:opacity-60"
              >
                {resending ? "Sending…" : "Resend code"}
              </button>
            )}
          </p>
          {warning && (
            <p className="mt-3 text-center text-xs text-muted-foreground">{warning}</p>
          )}
        </>
      )}
    </AuthSplitShell>
  );
}
