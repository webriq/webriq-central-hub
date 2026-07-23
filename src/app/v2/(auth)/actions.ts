"use server";

import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { randomBytes, createHash } from "node:crypto";
import { sendOtpEmail, sendInvitationEmail, sendPasswordResetOtpEmail } from "@/lib/email/mailer";
import { setGateCookie, clearGateCookie } from "@/lib/auth/gate-cookies";
import { checkOtpLockout, registerOtpFailure, resetOtpAttempts } from "@/lib/auth/otp-lockout";

// device_sessions and otp_codes are not yet in generated types — use untyped alias until supabase gen types is re-run
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = adminClient as any;

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/v2/auth/login");
}

export async function postLoginGate(
  deviceId: string,
  returnTo?: string
): Promise<{ redirect: string; error?: string; warning?: string; locked?: boolean; lockedUntil?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { redirect: "/v2/auth/login" };

  // Account-level OTP lockout blocks login entirely, before any other gate —
  // "wait 1 hour to relogin" applies regardless of device trust or forced-password state.
  const { locked, lockedUntil } = await checkOtpLockout(user.id);
  if (locked) {
    return { redirect: "/v2/auth/verify", locked: true, lockedUntil: lockedUntil! };
  }

  // Gate 1: forced password change
  if (user.user_metadata?.force_password_change) {
    await setGateCookie("change_password_required", "1", 3600);
    return { redirect: "/v2/auth/change-password" };
  }

  // Gate 2: device/inactivity check
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: deviceSession, error: dsErr } = await db
    .from("device_sessions")
    .select("last_verified_at")
    .eq("user_id", user.id)
    .eq("device_id", deviceId)
    .single() as { data: { last_verified_at: string } | null; error: { code?: string } | null };

  // PGRST116 = no matching row ("first login on this device") — expected, falls through to OTP.
  // Any other error is a genuine DB/RLS failure and must not be treated the same way.
  if (dsErr && dsErr.code !== "PGRST116") {
    console.error("[postLoginGate] device_sessions lookup failed:", dsErr);
    return { redirect: "/v2/auth/login", error: "Something went wrong checking your device. Please try again." };
  }

  if (!deviceSession || deviceSession.last_verified_at < sevenDaysAgo) {
    const bytes = randomBytes(4);
    const code = String(bytes.readUInt32BE(0) % 900000 + 100000);
    const codeHash = createHash("sha256").update(code).digest("hex");

    const { error: otpErr } = await db.from("otp_codes").insert({
      user_id: user.id,
      code_hash: codeHash,
      purpose: "device_verification",
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    if (otpErr) {
      console.error("[postLoginGate] OTP insert failed:", otpErr);
      return { redirect: "/v2/auth/verify", error: "Could not generate a verification code. Please try resending." };
    }

    let warning: string | undefined;
    try {
      await sendOtpEmail(user.email!, code);
    } catch (emailErr) {
      console.error("[postLoginGate] OTP email FAILED:", emailErr);
      warning = "We couldn't send the verification email. Use \"Resend code\" to try again.";
    }

    await setGateCookie("mfa_pending", "1", 600);
    return { redirect: "/v2/auth/verify", warning };
  }

  // Device is trusted — clear any lingering gate cookies from a previous incomplete session
  await clearGateCookie("mfa_pending");
  await clearGateCookie("change_password_required");

  const safe = returnTo?.startsWith("/v2/") ? returnTo : "/v2/dashboard";
  return { redirect: safe };
}

export async function confirmPasswordChange(
  newPassword: string
): Promise<{ error?: string }> {
  if (newPassword.length < 8) return { error: "Password must be at least 8 characters." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired. Please log in again." };

  const { error } = await adminClient.auth.admin.updateUserById(user.id, {
    password: newPassword,
    user_metadata: { ...user.user_metadata, force_password_change: false },
  });
  if (error) return { error: error.message };

  await clearGateCookie("change_password_required");
  return {};
}

export async function verifyOtpCode(
  code: string,
  deviceId: string
): Promise<{ error?: string; attemptsRemaining?: number; locked?: boolean; lockedUntil?: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const { locked, lockedUntil } = await checkOtpLockout(user.id);
  if (locked) {
    return { error: "Too many attempts.", locked: true, lockedUntil: lockedUntil! };
  }

  const codeHash = createHash("sha256").update(code).digest("hex");
  const { data: otpRecord } = await db
    .from("otp_codes")
    .select("id")
    .eq("user_id", user.id)
    .eq("code_hash", codeHash)
    .eq("purpose", "device_verification")
    .eq("used", false)
    .gte("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single() as { data: { id: string } | null; error: unknown };

  if (!otpRecord) {
    const failure = await registerOtpFailure(user.id, user.email!);
    return { error: "Incorrect or expired code.", ...failure };
  }

  await db.from("otp_codes").update({ used: true }).eq("id", otpRecord.id);
  await db.from("device_sessions").upsert(
    { user_id: user.id, device_id: deviceId, last_verified_at: new Date().toISOString() },
    { onConflict: "user_id,device_id" }
  );
  await resetOtpAttempts(user.id);

  await clearGateCookie("mfa_pending");
  return {};
}

async function getUserIdByEmail(email: string): Promise<{ id: string; email: string } | null> {
  const { data } = await adminClient
    .from("hub_users")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();
  return data;
}

export async function requestPasswordReset(email: string): Promise<{ ok: true }> {
  const target = await getUserIdByEmail(email);
  if (target) {
    const { locked } = await checkOtpLockout(target.id);
    if (!locked) {
      const bytes = randomBytes(4);
      const code = String(bytes.readUInt32BE(0) % 900000 + 100000);
      const codeHash = createHash("sha256").update(code).digest("hex");
      await db.from("otp_codes").insert({
        user_id: target.id,
        code_hash: codeHash,
        purpose: "password_reset",
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      try {
        await sendPasswordResetOtpEmail(target.email, code);
      } catch (e) {
        console.error("[requestPasswordReset] email failed:", e);
      }
    }
  }
  // Always generic — no enumeration signal either way (unknown email, locked account, or success).
  return { ok: true };
}

export async function verifyPasswordResetOtp(
  email: string,
  code: string
): Promise<{ error?: string; attemptsRemaining?: number; locked?: boolean; lockedUntil?: string | null; hashedToken?: string }> {
  const target = await getUserIdByEmail(email);
  if (!target) return { error: "Incorrect or expired code." };

  const { locked, lockedUntil } = await checkOtpLockout(target.id);
  if (locked) return { error: "Too many attempts.", locked: true, lockedUntil: lockedUntil! };

  const codeHash = createHash("sha256").update(code).digest("hex");
  const { data: otpRecord } = await db
    .from("otp_codes")
    .select("id")
    .eq("user_id", target.id)
    .eq("code_hash", codeHash)
    .eq("purpose", "password_reset")
    .eq("used", false)
    .gte("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single() as { data: { id: string } | null; error: unknown };

  if (!otpRecord) {
    const failure = await registerOtpFailure(target.id, target.email);
    return { error: "Incorrect or expired code.", ...failure };
  }

  await db.from("otp_codes").update({ used: true }).eq("id", otpRecord.id);
  await resetOtpAttempts(target.id);

  const { data, error } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email: target.email,
  });
  if (error || !data) return { error: "Could not complete verification. Please try again." };

  return { hashedToken: data.properties.hashed_token };
}

export async function inviteUser(
  email: string,
  fullName: string,
  role: "admin" | "hr" | "pm" | "developer" | "super_admin"
): Promise<{ tempPassword?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const callerRole = profile?.role;
  if (callerRole !== "admin" && callerRole !== "super_admin") {
    return { error: "Admin access required." };
  }
  if (role === "super_admin" && callerRole !== "super_admin") {
    return { error: "Only a Super Admin can invite Super Admin users." };
  }

  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  const tempBytes = randomBytes(12);
  const tempPassword = Array.from(tempBytes as Uint8Array)
    .map((b) => chars[b % chars.length])
    .join("");

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      display_name: fullName,
      force_password_change: true,
    },
  });
  if (error) return { error: error.message };

  if (data.user) {
    await adminClient.from("profiles").update({ role, full_name: fullName }).eq("id", data.user.id);
  }

  await sendInvitationEmail(email, fullName, tempPassword);
  return { tempPassword };
}

export async function registerFromInvite(
  password: string,
  deviceId: string
): Promise<{ redirect?: string; error?: string }> {
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired. Request a new invite from your administrator." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  await adminClient
    .from("hub_users")
    .update({ joined_at: new Date().toISOString() })
    .eq("id", user.id);

  return postLoginGate(deviceId);
}
