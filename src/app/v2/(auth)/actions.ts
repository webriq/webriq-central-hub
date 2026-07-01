"use server";

import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes, createHash } from "node:crypto";
import { sendOtpEmail, sendInvitationEmail } from "@/lib/email/mailer";

// device_sessions and otp_codes are not yet in generated types — use untyped alias until supabase gen types is re-run
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = adminClient as any;

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect("/v2/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/v2/auth/login");
}

export async function postLoginGate(
  deviceId: string,
  returnTo?: string
): Promise<{ redirect: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { redirect: "/v2/auth/login" };

  // Gate 1: forced password change
  if (user.user_metadata?.force_password_change) {
    const cookieStore = await cookies();
    cookieStore.set("change_password_required", "1", {
      httpOnly: true,
      secure: true,
      path: "/v2",
      sameSite: "lax",
      maxAge: 3600,
    });
    return { redirect: "/v2/auth/change-password" };
  }

  // Gate 2: device/inactivity check
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  console.log("[postLoginGate] user:", user.id, user.email, "deviceId:", deviceId);
  const { data: deviceSession, error: dsErr } = await db
    .from("device_sessions")
    .select("last_verified_at")
    .eq("user_id", user.id)
    .eq("device_id", deviceId)
    .single() as { data: { last_verified_at: string } | null; error: unknown };

  console.log("[postLoginGate] deviceSession:", deviceSession, "dsErr:", dsErr, "sevenDaysAgo:", sevenDaysAgo);

  if (!deviceSession || deviceSession.last_verified_at < sevenDaysAgo) {
    const bytes = randomBytes(4);
    const code = String(bytes.readUInt32BE(0) % 900000 + 100000);
    const codeHash = createHash("sha256").update(code).digest("hex");

    console.log("[postLoginGate] inserting OTP for user:", user.id, "email:", user.email);
    const { error: otpErr } = await db.from("otp_codes").insert({
      user_id: user.id,
      code_hash: codeHash,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    console.log("[postLoginGate] OTP insert error:", otpErr);

    console.log("[postLoginGate] sending OTP email to:", user.email, "code:", code);
    try {
      await sendOtpEmail(user.email!, code);
      console.log("[postLoginGate] OTP email sent OK");
    } catch (emailErr) {
      console.error("[postLoginGate] OTP email FAILED:", emailErr);
    }

    const cookieStore = await cookies();
    cookieStore.set("mfa_pending", "1", {
      httpOnly: true,
      secure: true,
      path: "/v2",
      sameSite: "lax",
      maxAge: 600,
    });
    return { redirect: "/v2/auth/verify" };
  }

  // Device is trusted — clear any lingering gate cookies from a previous incomplete session
  const cookieStore = await cookies();
  cookieStore.set("mfa_pending", "", { maxAge: 0, path: "/v2", httpOnly: true });
  cookieStore.set("change_password_required", "", { maxAge: 0, path: "/v2", httpOnly: true });

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

  const cookieStore = await cookies();
  cookieStore.set("change_password_required", "", { maxAge: 0, path: "/v2", httpOnly: true });
  return {};
}

export async function verifyOtpCode(
  code: string,
  deviceId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const codeHash = createHash("sha256").update(code).digest("hex");
  const { data: otpRecord } = await db
    .from("otp_codes")
    .select("id")
    .eq("user_id", user.id)
    .eq("code_hash", codeHash)
    .eq("used", false)
    .gte("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single() as { data: { id: string } | null; error: unknown };

  if (!otpRecord) return { error: "Invalid or expired code." };

  await db.from("otp_codes").update({ used: true }).eq("id", otpRecord.id);
  await db.from("device_sessions").upsert(
    { user_id: user.id, device_id: deviceId, last_verified_at: new Date().toISOString() },
    { onConflict: "user_id,device_id" }
  );

  const cookieStore = await cookies();
  cookieStore.set("mfa_pending", "", { maxAge: 0, path: "/v2", httpOnly: true });
  return {};
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
