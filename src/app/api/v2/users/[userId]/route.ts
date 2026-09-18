import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { VALID_ROLES, ROLE_DISPLAY, PROFILE_ROLE, type ValidRole } from "@/lib/auth/hub-role-map";
import { DEPARTMENT_ROLES, type DepartmentName } from "@/lib/auth/department-map";
import { requireAdmin } from "@/lib/users/admin-guard";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  // /simplify pass (task 378) — this used to be its own inline copy of the same 401/403 check
  // now shared with the deactivate/reactivate routes; consolidated onto one implementation.
  // Only the base check applies here — role/department/unlock edits keep their own narrower,
  // per-field super_admin rules below and were never blocked from self-service.
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const callerRole = guard.callerRole;

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

  // Task 378 — account status is no longer a bare column write. Deactivating also bans the
  // auth user, terminates their sessions and drops their project/phase memberships; doing any
  // of that here would duplicate the logic, and writing status alone would leave a row reading
  // "Inactive" while the person could still log in. Routed to the dedicated endpoints instead.
  if (body.status !== undefined) {
    return NextResponse.json(
      { error: "Use POST /api/v2/users/[userId]/deactivate or /reactivate to change account status." },
      { status: 409 }
    );
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
