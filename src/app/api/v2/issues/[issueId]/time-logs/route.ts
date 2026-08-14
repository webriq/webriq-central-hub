import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Time Logs tab for the issue detail page (task 237) — adapted from
// `api/v2/tasks/[taskId]/time-logs/route.ts` (task 214/215/226), swapping `task_id` for
// `issue_id`. `time_logs.issue_id` already existed before this task (task 234's issue timer
// writes to it); `time_logs_developer_read_all` (migration 094) is role-scoped, not
// `task_id`-scoped, so it already covers issue-linked rows with zero RLS changes. Writes stay
// owner-scoped by the pre-existing `time_logs_developer_own` policy (migration 026).
//
// `employee_id` FKs `auth.users(id)`, not `profiles` — no FK PostgREST can embed through, so
// display names are resolved with a second `profiles` lookup, falling back to the row's own
// `owner_name`/`owner_email` (populated on Zoho-imported rows, which have no Hub account).
function resolveOwnerName(
  row: { employee_id: string | null; owner_name: string | null; owner_email: string | null },
  profileNames: Map<string, string>
): string {
  if (row.employee_id) {
    const name = profileNames.get(row.employee_id);
    if (name) return name;
  }
  return row.owner_name || row.owner_email || "Unknown";
}

const SOURCE_VISIBLE_ROLES = ["admin", "super_admin", "pm", "hr"];

// GET /api/v2/issues/[issueId]/time-logs — every entry for the issue, newest date first
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const { issueId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: logs, error } = await supabase
    .from("time_logs")
    .select("id, employee_id, date_logged, hours, note, source, owner_name, owner_email, start_time, end_time, timeline, created_at")
    .eq("issue_id", issueId)
    .order("date_logged", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const employeeIds = [...new Set((logs ?? []).map((l) => l.employee_id).filter((id): id is string => !!id))];
  const profileNames = new Map<string, string>();
  if (employeeIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", employeeIds);
    for (const p of profiles ?? []) {
      if (p.full_name) profileNames.set(p.id, p.full_name);
    }
  }

  const entries = (logs ?? []).map((l) => ({
    id: l.id,
    date_logged: l.date_logged,
    hours: l.hours,
    note: l.note,
    source: l.source,
    start_time: l.start_time,
    end_time: l.end_time,
    timeline: l.timeline,
    created_at: l.created_at,
    display_name: resolveOwnerName(l, profileNames),
    can_edit: l.employee_id === user.id,
  }));

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  let canAdd = false;
  if (profile?.role === "developer") {
    const { data: issue } = await supabase.from("issues").select("assignee_id").eq("id", issueId).maybeSingle();
    canAdd = !!issue?.assignee_id && issue.assignee_id === user.id;
  }
  const canSeeSource = !!profile?.role && SOURCE_VISIBLE_ROLES.includes(profile.role);

  return NextResponse.json({ entries, canAdd, canSeeSource });
}

// POST /api/v2/issues/[issueId]/time-logs — manual entry, assignee-only. Not gated by
// `getIssueEditPermission` (task 237 requirement 6) — logging your own time against an issue is
// independent of whether you can edit its other fields, matching the task-side model where an
// assignee-only developer can log manual hours the same as they can start its timer. Takes a
// start_time/end_time period (not a raw hours number) — hours is always computed server-side.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const { issueId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile?.role || profile.role === "client") {
    return NextResponse.json({ error: "You do not have permission to log time" }, { status: 403 });
  }

  const { data: issue } = await supabase.from("issues").select("id, assignee_id, project_id").eq("id", issueId).maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  if (issue.assignee_id !== user.id) {
    return NextResponse.json({ error: "You must be assigned to this issue to log time" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const dateLogged = typeof body.date_logged === "string" ? body.date_logged : "";
  const startTime = typeof body.start_time === "string" ? body.start_time : "";
  const endTime = typeof body.end_time === "string" ? body.end_time : "";
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  if (!dateLogged || !startTime || !endTime) {
    return NextResponse.json({ error: "date_logged, start_time, and end_time are required" }, { status: 400 });
  }

  const hours = (new Date(endTime).getTime() - new Date(startTime).getTime()) / 3_600_000;
  if (!(hours > 0) || hours > 24) {
    return NextResponse.json({ error: "End time must be after start time, and no more than 24 hours later" }, { status: 400 });
  }

  const { data: created, error } = await supabase
    .from("time_logs")
    .insert({
      issue_id: issueId,
      project_id: issue.project_id,
      employee_id: user.id,
      date_logged: dateLogged,
      hours,
      note,
      source: "manual",
      billable: false,
      start_time: startTime,
      end_time: endTime,
    })
    .select("id, date_logged, hours, note, source, start_time, end_time, timeline, created_at")
    .single();

  if (error) {
    console.error("[api/v2/issues/[id]/time-logs] insert failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: callerProfile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();

  return NextResponse.json(
    { ...created, display_name: callerProfile?.full_name || user.email || "Unknown", can_edit: true },
    { status: 201 }
  );
}
