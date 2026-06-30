import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/v2/projects/[projectId]/members
// Returns all hub users (developer, pm, admin) for the assignee picker.
// Any authenticated session may call this — no admin gate needed.
// [projectId] is in the URL for logical grouping; filtering is by role, not project membership.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  await params; // required to satisfy Next.js 16 dynamic params
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role")
    .in("role", ["developer", "pm", "admin"])
    .order("full_name", { ascending: true });

  if (error) {
    console.error("[api/v2/projects/members] fetch failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
