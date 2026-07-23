import { adminClient } from "@/lib/supabase/admin";
import { sendAccountLockedEmail } from "@/lib/email/mailer";

export const MAX_OTP_ATTEMPTS = 4;
export const OTP_LOCK_DURATION_MS = 60 * 60 * 1000; // 1 hour

export async function checkOtpLockout(
  userId: string
): Promise<{ locked: boolean; lockedUntil: string | null }> {
  const { data: profile } = await adminClient
    .from("profiles")
    .select("otp_locked_until")
    .eq("id", userId)
    .single();

  if (!profile?.otp_locked_until) return { locked: false, lockedUntil: null };

  if (new Date(profile.otp_locked_until) <= new Date()) {
    // Lazy expiry — clear it and give the account a fresh window.
    await adminClient
      .from("profiles")
      .update({ otp_failed_attempts: 0, otp_locked_until: null })
      .eq("id", userId);
    return { locked: false, lockedUntil: null };
  }

  return { locked: true, lockedUntil: profile.otp_locked_until };
}

export async function registerOtpFailure(
  userId: string,
  email: string
): Promise<{ attemptsRemaining: number; locked: boolean; lockedUntil: string | null }> {
  const { data: profile } = await adminClient
    .from("profiles")
    .select("otp_failed_attempts")
    .eq("id", userId)
    .single();

  const nextCount = (profile?.otp_failed_attempts ?? 0) + 1;

  if (nextCount >= MAX_OTP_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + OTP_LOCK_DURATION_MS).toISOString();
    await adminClient
      .from("profiles")
      .update({ otp_failed_attempts: nextCount, otp_locked_until: lockedUntil })
      .eq("id", userId);
    try {
      await sendAccountLockedEmail(email);
    } catch (e) {
      console.error("[registerOtpFailure] lockout email failed:", e);
    }
    return { attemptsRemaining: 0, locked: true, lockedUntil };
  }

  await adminClient
    .from("profiles")
    .update({ otp_failed_attempts: nextCount })
    .eq("id", userId);
  return { attemptsRemaining: MAX_OTP_ATTEMPTS - nextCount, locked: false, lockedUntil: null };
}

export async function resetOtpAttempts(userId: string): Promise<void> {
  await adminClient
    .from("profiles")
    .update({ otp_failed_attempts: 0, otp_locked_until: null })
    .eq("id", userId);
}
