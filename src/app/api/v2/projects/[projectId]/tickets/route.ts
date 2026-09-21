import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { addProjectMember } from "@/lib/programme/phase-membership";
import { buildTicketAssigneeSync } from "@/lib/tickets/assignee-sync";
import { notifyCustomerTicketCreated } from "@/lib/desk/customer-view-access";

const VALID_STATUS = ["open", "in_progress", "ready_for_qa", "testing_completed", "for_client_approval", "ready_to_merge", "post_live_qa", "closed"] as const;
const VALID_SEVERITY = ["Show stopper", "Critical", "Major", "Minor", "None"] as const;

// GET /api/v2/projects/[projectId]/tickets
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}

// POST /api/v2/projects/[projectId]/tickets  — create an ticket (PM/Admin via RLS)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (body.status && !VALID_STATUS.includes(body.status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  if (body.severity && !VALID_SEVERITY.includes(body.severity)) {
    return NextResponse.json({ error: "invalid severity" }, { status: 400 });
  }

  // Task 351 — tickets are multi-assignee (`tickets.assignees`). New callers send `assignees: []`;
  // the legacy `assignee_name`/`assignee_email` free-text path is still accepted for anything
  // not yet migrated. The scalar `assignee_id`/`assignee_name` columns are derived from the array.
  const sync = "assignees" in body
    ? await buildTicketAssigneeSync(supabase, body.assignees)
    : { assignees: [], assignee_id: null, assignee_name: body.assignee_name?.trim() || null, assignee_email: body.assignee_email?.trim() || null };

  const { data, error } = await supabase
    .from("tickets")
    .insert({
      project_id: project.id,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      status: body.status || "open",
      severity: body.severity || null,
      assignees: sync.assignees.length > 0 ? sync.assignees : null,
      assignee_id: sync.assignee_id,
      assignee_name: sync.assignee_name,
      assignee_email: sync.assignee_email,
      due_date: body.due_date || null,
      due_time: body.due_time || null,
      notes: body.notes?.trim() || null,
      // Task 363 — set when this ticket was filed from a Desk ticket thread message (the "File a
      // Ticket" flow). The FK constraint (migration 137, retargeted at `inbox` by migration 147)
      // rejects a bad/nonexistent ticket id.
      source_inbox_id: body.source_inbox_id || null,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/v2/projects/[id]/tickets] create failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Task 287 / 351 — each assignee gets persistent project access. Best-effort.
  if (sync.assignees.length > 0) {
    await Promise.all(sync.assignees.map((id) => addProjectMember(project.id, id, user.id)))
      .catch((err) => console.error("[api/v2/projects/[id]/tickets] project_members sync failed:", err));
  }

  // Task 381 — "File a Ticket" sets source_inbox_id (task 363, renamed from source_ticket_id by
  // migration 147) to the originating Desk > Inbox message; when present, resend that message's
  // task-379 "ticket created" customer email. adminClient (not the route's session-scoped
  // `supabase`) for consistency with every other call site that touches `inbox` for this
  // feature. Best-effort — notifyCustomerTicketCreated already swallows its own failures and
  // returns a boolean this call site doesn't need to act on.
  if (data.source_inbox_id) {
    const { data: sourceTicket, error: sourceTicketError } = await adminClient
      .from("inbox")
      .select("id, ticket_number, subject, requester_email")
      .eq("id", data.source_inbox_id)
      .maybeSingle();
    if (sourceTicketError) {
      console.error("[api/v2/projects/[id]/tickets] source ticket lookup failed:", sourceTicketError.message);
    } else if (sourceTicket?.requester_email) {
      await notifyCustomerTicketCreated({
        ticketId: sourceTicket.id,
        ticketNumber: sourceTicket.ticket_number,
        subject: sourceTicket.subject,
        requesterEmail: sourceTicket.requester_email,
      });
    }
  }

  return NextResponse.json(data, { status: 201 });
}
