import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

const VALID_ROLES = ["admin", "super_admin", "hr", "pm", "developer", "client", "other"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

const ROLE_DISPLAY: Record<ValidRole, string> = {
  admin: "Admin",
  super_admin: "Super Admin",
  hr: "HR",
  pm: "PM",
  developer: "Developer",
  client: "Client",
  other: "Other",
};

// "other" maps to "client" in profiles (closest enum value for non-standard roles)
const PROFILE_ROLE: Record<ValidRole, "admin" | "super_admin" | "hr" | "pm" | "developer" | "client"> = {
  admin: "admin",
  super_admin: "super_admin",
  hr: "hr",
  pm: "pm",
  developer: "developer",
  client: "client",
  other: "client",
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: callerProfile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const callerRole = callerProfile?.role;
  if (callerRole !== "admin" && callerRole !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as { role?: string; status?: string; unlockOtp?: boolean };

  if (body.role !== undefined) {
    if (!(VALID_ROLES as readonly string[]).includes(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (body.role === "super_admin" && callerRole !== "super_admin") {
      return NextResponse.json({ error: "Only a Super Admin can assign the Super Admin role." }, { status: 403 });
    }
    const role = body.role as ValidRole;

    // Write to both tables atomically — profiles.role (auth enum) + hub_users.role (display string)
    const [profileRes, hubRes] = await Promise.all([
      adminClient.from("profiles").update({ role: PROFILE_ROLE[role] }).eq("id", userId),
      adminClient.from("hub_users").update({ role: ROLE_DISPLAY[role] }).eq("id", userId),
    ]);

    if (profileRes.error) return NextResponse.json({ error: profileRes.error.message }, { status: 500 });
    if (hubRes.error) return NextResponse.json({ error: hubRes.error.message }, { status: 500 });
  }

  if (body.status !== undefined) {
    const { error } = await adminClient
      .from("hub_users")
      .update({ status: body.status })
      .eq("id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body.unlockOtp === true) {
    if (callerRole !== "super_admin") {
      return NextResponse.json({ error: "Only a Super Admin can unlock an account." }, { status: 403 });
    }
    const { error } = await adminClient
      .from("profiles")
      .update({ otp_failed_attempts: 0, otp_locked_until: null })
      .eq("id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
