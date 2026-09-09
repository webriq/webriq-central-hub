import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAssignableMembers } from "@/lib/members/assignable";

// GET /api/v2/projects/[projectId]/members
// Returns the assignee pool for the New Task / New Issue pickers: every staff-role hub user
// minus the exclude list (task 351 — see `getAssignableMembers`). Any authenticated session may
// call this. [projectId] is in the URL for logical grouping only; the list is role-filtered,
// not project-membership-filtered.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  await params; // required to satisfy Next.js 16 dynamic params
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(await getAssignableMembers());
}
