import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { getTicketEditPermission } from "@/lib/tickets/permissions";
import { addProjectMember } from "@/lib/programme/phase-membership";
import { buildTicketAssigneeSync } from "@/lib/tickets/assignee-sync";

const VALID_STATUS = ["open", "in_progress", "ready_for_qa", "testing_completed", "for_client_approval", "ready_to_merge", "post_live_qa", "closed"] as const;
const VALID_SEVERITY = ["Show stopper", "Critical", "Major", "Minor", "None"] as const;
type TicketUpdate = Database["public"]["Tables"]["issues"]["Update"];

// Task 234 — fields an assignee-only developer (not the creator) may still touch: status.
// Tickets have no `position` column (unlike tasks — no board drag-and-drop reordering here).
const ASSIGNEE_ALLOWED_FIELDS = new Set(["status"]);

// PATCH /api/v2/tickets/[ticketId]
// Partial update — also the board drag-and-drop endpoint (status only, no position column on tickets).
// RLS: PM/Admin full write (issues_pm_write, migration 051); developers may write to tickets they
// created or are assigned to (issues_developer_update, migration 100) — but field/value
// restriction for the assignee-only case is enforced here, via getTicketEditPermission (single
// source of truth, shared with the client-side UI gating), mirroring
// api/v2/tasks/[taskId]/route.ts's own pattern.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const { ticketId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: existingTicket }, { data: profile }] = await Promise.all([
    supabase.from("issues").select("created_by, assignee_id, assignees, project_id").eq("id", ticketId).maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);
  if (!existingTicket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const perm = getTicketEditPermission(profile?.role, user.id, existingTicket);
  if (!perm.canChangeStatus && !perm.canEditDetails) {
    return NextResponse.json({ error: "You don't have permission to edit this ticket" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  if (!perm.canEditDetails) {
    const submittedFields = Object.keys(body);
    const disallowed = submittedFields.filter((f) => !ASSIGNEE_ALLOWED_FIELDS.has(f));
    if (disallowed.length > 0) {
      return NextResponse.json({ error: `Not permitted to edit: ${disallowed.join(", ")}` }, { status: 403 });
    }
  }

  const patch: TicketUpdate = { updated_at: new Date().toISOString() };

  if (perm.canEditDetails) {
    if (typeof body.title === "string") patch.title = body.title.trim();
    if ("description" in body) patch.description = body.description?.trim?.() || null;
    if ("due_date" in body) patch.due_date = body.due_date || null;
    if ("due_time" in body) patch.due_time = body.due_time || null;
    if ("notes" in body) patch.notes = body.notes?.trim?.() || null;
    if ("flag" in body) patch.flag = body.flag?.trim?.() || null;
    if ("assignee_name" in body) patch.assignee_name = body.assignee_name?.trim?.() || null;
    if ("assignee_email" in body) patch.assignee_email = body.assignee_email?.trim?.() || null;
    // Task 351 — multi-assignee (`tickets.assignees`). Prefer `assignees: []`; the scalar
    // `assignee_id`/`assignee_name` columns are derived from it. The legacy single `assignee_id`
    // branch below stays for callers not yet migrated.
    if ("assignees" in body) {
      const sync = await buildTicketAssigneeSync(supabase, body.assignees);
      patch.assignees = sync.assignees.length > 0 ? sync.assignees : null;
      patch.assignee_id = sync.assignee_id;
      patch.assignee_name = sync.assignee_name;
      patch.assignee_email = sync.assignee_email;
      // Task 287 — each assignee gets persistent project access (project_members), so it
      // survives the ticket being unassigned/deleted later. Best-effort.
      if (sync.assignees.length > 0) {
        void Promise.all(sync.assignees.map((id) => addProjectMember(existingTicket.project_id, id, user.id)))
          .catch((err) => console.error("[api/v2/tickets/[id]] project_members sync failed:", err));
      }
    } else if ("assignee_id" in body) {
      patch.assignee_id = body.assignee_id || null;
      patch.assignees = body.assignee_id ? [body.assignee_id] : null;
      if (patch.assignee_id) {
        void addProjectMember(existingTicket.project_id, patch.assignee_id, user.id)
          .catch((err) => console.error("[api/v2/tickets/[id]] project_members sync failed:", err));
      }
    }
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
    .eq("id", ticketId)
    .select()
    .single();

  if (error) {
    console.error("[api/v2/tickets/[id]] patch failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (!data) {
    return NextResponse.json({ error: "Ticket not found or not permitted" }, { status: 403 });
  }
  return NextResponse.json(data);
}

// DELETE /api/v2/tickets/[ticketId]  — delete (PM/Admin or the ticket's creator via RLS; migration 111)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const { ticketId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("issues").delete().eq("id", ticketId);
  if (error) {
    console.error("[api/v2/tickets/[id]] delete failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
