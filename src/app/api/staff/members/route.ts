import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAssignableMembers } from "@/lib/members/assignable";

// GET /api/staff/members (task 363)
// Cross-project assignee pool for the Desk > Tickets tab — that listing spans every project, so
// the existing per-project `/api/v2/projects/[projectId]/members` route (whose own comment notes
// [projectId] is unused, "for logical grouping only" — it's already role-filtered, not
// project-membership-filtered) doesn't fit a page with no single project to hang the URL off of.
// Delegates to the same `getAssignableMembers()` single source of truth (task 351) rather than
// reintroducing a second "who can be assigned" role list — any authenticated session may call
// this, matching that sibling route's own openness (the data itself, staff id/name/avatar/role,
// isn't sensitive).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(await getAssignableMembers());
}
