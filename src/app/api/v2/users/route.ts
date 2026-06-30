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
  if (callerProfile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: hubUsers, error } = await adminClient
    .from("hub_users")
    .select("id, email, first_name, last_name, role, status, is_invited, joined_at, external_id, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (hubUsers ?? []).map((u) => u.id);

  const { data: profiles } = ids.length > 0
    ? await adminClient.from("profiles").select("id, role, full_name").in("id", ids)
    : { data: [] as { id: string; role: string; full_name: string | null }[] };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const merged = (hubUsers ?? []).map((u) => ({
    ...u,
    profile_role: profileMap.get(u.id)?.role ?? null,
    full_name: profileMap.get(u.id)?.full_name ?? null,
  }));

  return NextResponse.json(merged);
}
