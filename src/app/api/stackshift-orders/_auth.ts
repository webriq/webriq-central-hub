import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

const REVIEWER_ROLES = ["admin", "super_admin", "pm"];

// Task 347 — the /stackshift-orders review actions are admin/super_admin/pm only.
export async function requireOrderReviewer():
  Promise<{ userId: string } | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!REVIEWER_ROLES.includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { userId: user.id };
}
