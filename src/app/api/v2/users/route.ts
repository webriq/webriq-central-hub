import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: callerProfile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const viewerRole = callerProfile?.role ?? null;
  if (viewerRole !== "admin" && viewerRole !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: hubUsers, error } = await adminClient
    .from("hub_users")
    .select("id, email, first_name, last_name, role, status, is_invited, joined_at, external_id, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (hubUsers ?? []).map((u) => u.id);

  const { data: profiles } = ids.length > 0
    ? await adminClient.from("profiles").select("id, role, full_name, avatar_url, otp_locked_until, department_id").in("id", ids)
    : { data: [] as { id: string; role: string; full_name: string | null; avatar_url: string | null; otp_locked_until: string | null; department_id: string | null }[] };

  const { data: departments } = await adminClient.from("departments").select("id, name");
  const departmentMap = new Map((departments ?? []).map((d) => [d.id, d.name]));

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const merged = (hubUsers ?? []).map((u) => {
    const departmentId = profileMap.get(u.id)?.department_id ?? null;
    return {
      ...u,
      profile_role: profileMap.get(u.id)?.role ?? null,
      full_name: profileMap.get(u.id)?.full_name ?? null,
      avatar_url: profileMap.get(u.id)?.avatar_url ?? null,
      otp_locked_until: profileMap.get(u.id)?.otp_locked_until ?? null,
      department_id: departmentId,
      department_name: departmentId ? departmentMap.get(departmentId) ?? null : null,
    };
  });

  return NextResponse.json({ viewerRole, users: merged });
}
