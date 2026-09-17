import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

const REVIEWER_ROLES = ["admin", "super_admin"];

// Task 347 — the /stackshift-orders review actions are admin/super_admin only
// (task 375 removed pm).
export async function requireOrderReviewer():
  Promise<{ userId: string; departmentName: string | null } | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role, department_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!REVIEWER_ROLES.includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let departmentName: string | null = null;
  if (profile?.department_id) {
    const { data: department } = await adminClient
      .from("departments")
      .select("name")
      .eq("id", profile.department_id)
      .maybeSingle();
    departmentName = department?.name ?? null;
  }

  return { userId: user.id, departmentName };
}

// Task 366 — Finance department has read-only access to Orders: viewing the list and
// an order's detail is fine, but no Convert / Dismiss / Reopen, regardless of role.
export async function requireOrderMutator():
  Promise<{ userId: string } | NextResponse> {
  const auth = await requireOrderReviewer();
  if (auth instanceof NextResponse) return auth;
  if (auth.departmentName === "Finance") {
    return NextResponse.json({ error: "Finance department has read-only access to Orders." }, { status: 403 });
  }
  return { userId: auth.userId };
}
