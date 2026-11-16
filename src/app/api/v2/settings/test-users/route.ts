import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { ROLE_DISPLAY } from "@/lib/auth/hub-role-map";
import { orIlike } from "@/lib/postgrest-search";
import { parseIdLists, settingsGate, SUGGESTION_LIMIT } from "../_gate";

// Task 476 — Settings → Test Users (admin/super_admin only). GET ?q= returns search suggestions
// (name, email, role, department) for the chip box; PATCH flips profiles.is_test_user.
// Role changes stay on /dashboard/users.
export async function GET(req: NextRequest) {
  const res = await settingsGate("admins");
  if (res) return res;
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const nameFilter = orIlike(["email", "first_name", "last_name"], q);
  if (!nameFilter) return NextResponse.json({ rows: [] });

  const term = q.trim().toLowerCase();
  const [hub, depts] = await Promise.all([
    adminClient.from("hub_users").select("id").or(nameFilter).limit(100),
    adminClient.from("departments").select("id").or(orIlike(["name"], q)!),
  ]);
  const roles = Object.entries(ROLE_DISPLAY).filter(([k, label]) => k !== "other" && label.toLowerCase().includes(term)).map(([k]) => k);
  const parts = [orIlike(["full_name"], q)!];
  const hubIds = (hub.data ?? []).map((u) => u.id);
  const deptIds = (depts.data ?? []).map((d) => d.id);
  if (hubIds.length) parts.push(`id.in.(${hubIds.join(",")})`);
  if (deptIds.length) parts.push(`department_id.in.(${deptIds.join(",")})`);
  if (roles.length) parts.push(`role.in.(${roles.join(",")})`);

  const { data: rows, error } = await adminClient
    .from("profiles").select("id, full_name").or(parts.join(",")).order("full_name", { ascending: true, nullsFirst: false }).limit(SUGGESTION_LIMIT);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (rows ?? []).map((r) => r.id);
  const { data: hubUsers } = ids.length
    ? await adminClient.from("hub_users").select("id, email").in("id", ids)
    : { data: [] as { id: string; email: string }[] };
  const emailById = new Map((hubUsers ?? []).map((u) => [u.id, u.email]));
  return NextResponse.json({ rows: (rows ?? []).map((r) => ({ ...r, email: emailById.get(r.id) ?? null })) });
}

// Bulk: { add: userIds[], remove: userIds[] } from the Settings chip box.
export async function PATCH(req: NextRequest) {
  const res = await settingsGate("admins");
  if (res) return res;
  const ids = parseIdLists(await req.json().catch(() => null));
  if (!ids) return NextResponse.json({ error: "add and remove must be arrays of ids" }, { status: 400 });
  for (const [list, value] of [[ids.add, true], [ids.remove, false]] as const) {
    if (!list.length) continue;
    const { error } = await adminClient.from("profiles").update({ is_test_user: value }).in("id", list);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ added: ids.add.length, removed: ids.remove.length });
}
