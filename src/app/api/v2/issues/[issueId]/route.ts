import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

const VALID_STATUS = ["open", "in_progress", "ready_for_qa", "testing_completed", "for_client_approval", "ready_to_merge", "post_live_qa", "closed"] as const;
const VALID_SEVERITY = ["Show stopper", "Critical", "Major", "Minor", "None"] as const;
type IssueUpdate = Database["public"]["Tables"]["issues"]["Update"];

// PATCH /api/v2/issues/[issueId]
// Partial update — also the board drag-and-drop endpoint (status only, no position column on issues).
// RLS: PM/Admin full write; developers are read-only (issues_pm_write policy, migration 051).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const { issueId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const patch: IssueUpdate = { updated_at: new Date().toISOString() };

  if (typeof body.title === "string") patch.title = body.title.trim();
  if ("description" in body) patch.description = body.description?.trim?.() || null;
  if ("due_date" in body) patch.due_date = body.due_date || null;
  if ("flag" in body) patch.flag = body.flag?.trim?.() || null;
  if ("assignee_name" in body) patch.assignee_name = body.assignee_name?.trim?.() || null;
  if ("assignee_email" in body) patch.assignee_email = body.assignee_email?.trim?.() || null;
  if (typeof body.status === "string") {
    if (!(VALID_STATUS as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    patch.status = body.status;
  }
  if ("severity" in body) {
    if (body.severity !== null && !(VALID_SEVERITY as readonly string[]).includes(body.severity)) {
      return NextResponse.json({ error: "invalid severity" }, { status: 400 });
    }
    patch.severity = body.severity;
  }

  const { data, error } = await supabase
    .from("issues")
    .update(patch)
    .eq("id", issueId)
    .select()
    .single();

  if (error) {
    console.error("[api/v2/issues/[id]] patch failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (!data) {
    return NextResponse.json({ error: "Issue not found or not permitted" }, { status: 403 });
  }
  return NextResponse.json(data);
}

// DELETE /api/v2/issues/[issueId]  — delete (PM/Admin via RLS)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const { issueId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("issues").delete().eq("id", issueId);
  if (error) {
    console.error("[api/v2/issues/[id]] delete failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
