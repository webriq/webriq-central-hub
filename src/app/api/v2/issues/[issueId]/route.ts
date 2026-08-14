import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { getIssueEditPermission } from "@/lib/issues/permissions";

const VALID_STATUS = ["open", "in_progress", "ready_for_qa", "testing_completed", "for_client_approval", "ready_to_merge", "post_live_qa", "closed"] as const;
const VALID_SEVERITY = ["Show stopper", "Critical", "Major", "Minor", "None"] as const;
type IssueUpdate = Database["public"]["Tables"]["issues"]["Update"];

// Task 234 — fields an assignee-only developer (not the creator) may still touch: status.
// Issues have no `position` column (unlike tasks — no board drag-and-drop reordering here).
const ASSIGNEE_ALLOWED_FIELDS = new Set(["status"]);

// PATCH /api/v2/issues/[issueId]
// Partial update — also the board drag-and-drop endpoint (status only, no position column on issues).
// RLS: PM/Admin full write (issues_pm_write, migration 051); developers may write to issues they
// created or are assigned to (issues_developer_update, migration 100) — but field/value
// restriction for the assignee-only case is enforced here, via getIssueEditPermission (single
// source of truth, shared with the client-side UI gating), mirroring
// api/v2/tasks/[taskId]/route.ts's own pattern.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const { issueId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: existingIssue }, { data: profile }] = await Promise.all([
    supabase.from("issues").select("created_by, assignee_id").eq("id", issueId).maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);
  if (!existingIssue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  const perm = getIssueEditPermission(profile?.role, user.id, existingIssue);
  if (!perm.canChangeStatus && !perm.canEditDetails) {
    return NextResponse.json({ error: "You don't have permission to edit this issue" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  if (!perm.canEditDetails) {
    const submittedFields = Object.keys(body);
    const disallowed = submittedFields.filter((f) => !ASSIGNEE_ALLOWED_FIELDS.has(f));
    if (disallowed.length > 0) {
      return NextResponse.json({ error: `Not permitted to edit: ${disallowed.join(", ")}` }, { status: 403 });
    }
  }

  const patch: IssueUpdate = { updated_at: new Date().toISOString() };

  if (perm.canEditDetails) {
    if (typeof body.title === "string") patch.title = body.title.trim();
    if ("description" in body) patch.description = body.description?.trim?.() || null;
    if ("due_date" in body) patch.due_date = body.due_date || null;
    if ("flag" in body) patch.flag = body.flag?.trim?.() || null;
    if ("assignee_name" in body) patch.assignee_name = body.assignee_name?.trim?.() || null;
    if ("assignee_email" in body) patch.assignee_email = body.assignee_email?.trim?.() || null;
    if ("assignee_id" in body) patch.assignee_id = body.assignee_id || null;
    if ("severity" in body) {
      if (body.severity !== null && !(VALID_SEVERITY as readonly string[]).includes(body.severity)) {
        return NextResponse.json({ error: "invalid severity" }, { status: 400 });
      }
      patch.severity = body.severity;
    }
  }
  if (typeof body.status === "string") {
    if (!(VALID_STATUS as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    if (perm.allowedStatusValues !== "all" && !perm.allowedStatusValues.includes(body.status)) {
      return NextResponse.json({ error: "Not permitted to set this status" }, { status: 403 });
    }
    patch.status = body.status;
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
