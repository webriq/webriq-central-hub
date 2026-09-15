import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { VALID_ROLES, ROLE_DISPLAY, PROFILE_ROLE, type ValidRole } from "@/lib/auth/hub-role-map";
import { DEPARTMENT_ROLES, type DepartmentName } from "@/lib/auth/department-map";

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

  const body = await req.json() as { role?: string; status?: string; unlockOtp?: boolean; department_id?: string | null };

  if (body.role !== undefined) {
    if (!(VALID_ROLES as readonly string[]).includes(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (body.role === "super_admin" && callerRole !== "super_admin") {
      return NextResponse.json({ error: "Only a Super Admin can assign the Super Admin role." }, { status: 403 });
    }
    const role = body.role as ValidRole;

    const { data: current } = await adminClient
      .from("profiles")
      .select("department_id")
      .eq("id", userId)
      .maybeSingle();
    let deptName: string | null = null;
    if (current?.department_id) {
      const { data: dept } = await adminClient.from("departments").select("name").eq("id", current.department_id).maybeSingle();
      deptName = dept?.name ?? null;
    }
    if (deptName && !DEPARTMENT_ROLES[deptName as DepartmentName].includes(role)) {
      return NextResponse.json(
        { error: `"${ROLE_DISPLAY[role]}" isn't compatible with this user's department (${deptName}).` },
        { status: 400 }
      );
    }

    // Write to both tables atomically — profiles.role (auth enum) + hub_users.role (display string)
    const [profileRes, hubRes] = await Promise.all([
      adminClient.from("profiles").update({ role: PROFILE_ROLE[role] }).eq("id", userId),
      adminClient.from("hub_users").update({ role: ROLE_DISPLAY[role] }).eq("id", userId),
    ]);

    if (profileRes.error) return NextResponse.json({ error: profileRes.error.message }, { status: 500 });
    if (hubRes.error) return NextResponse.json({ error: hubRes.error.message }, { status: 500 });
  }

  if (body.department_id !== undefined) {
    if (body.department_id === null) {
      const { error } = await adminClient.from("profiles").update({ department_id: null }).eq("id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { data: dept } = await adminClient
        .from("departments")
        .select("id, name")
        .eq("id", body.department_id)
        .maybeSingle();
      if (!dept) return NextResponse.json({ error: "Invalid department" }, { status: 400 });

      const { data: current } = await adminClient.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (current?.role && !DEPARTMENT_ROLES[dept.name as DepartmentName].includes(current.role as ValidRole)) {
        return NextResponse.json(
          { error: `This user's role isn't compatible with ${dept.name}. Change their role first.` },
          { status: 400 }
        );
      }

      const { error } = await adminClient.from("profiles").update({ department_id: dept.id }).eq("id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
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
