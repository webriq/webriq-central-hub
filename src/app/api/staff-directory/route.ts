import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Lightweight, narrow-scoped directory for asset-sharing pickers — deliberately not
// GET /api/v2/users (admin/super_admin-only, returns email/invite-status/etc. that a
// sharing picker doesn't need). Readable by any role already permitted to manage
// customer_assets (matches the upload route's own write-role check), returning only
// id/full_name/role, excluding client-role rows.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: myProfile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!myProfile?.role || !["admin", "super_admin", "pm", "marketing"].includes(myProfile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .neq("role", "client")
    .order("full_name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
