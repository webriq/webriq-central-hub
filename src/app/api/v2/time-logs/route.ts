import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/v2/time-logs?from=&to=&project_id= — cross-project time-log list for the dedicated
// Time Logs page (task 226). Distinct from `api/v2/tasks/[taskId]/time-logs` (tasks 214/215),
// which is scoped to one task's tab — this route aggregates across every project/task for a
// date range, which is what a period-filtered, role-scoped table needs. Reuses the exact RLS
// already in place (`time_logs_manager_read` migration 048; `time_logs_developer_own` +
// `time_logs_developer_read_all` migrations 026/094) — no new migration.
//
// `employee_id` FKs `auth.users(id)`, not `profiles`/`tasks`/`projects` — no FK PostgREST can
// embed through, so display names/project/task are resolved via batch `Map` lookups, mirroring
// the sibling per-task route's `resolveOwnerName()` pattern.
//
// Task 230 — POST added below (unified, non-nested create: task-linked, issue-linked, or a
// task-less/issue-less "General Log", storing the free text directly in `note`, per the task
// doc's Assumption 1/2). GET extended to resolve issue titles/display_id alongside task ones, and
// to surface `project_public_id`/`task_display_id`/`issue_display_id`/`entry_kind`/`log_title` so
// the table's inline editors and detail-link icon (Requirement 15) don't need a second fetch.
const VIEW_ALL_ROLES = ["admin", "super_admin", "pm", "hr"];
const PAGE = 1000;

type TimeLogRow = {
  id: string;
  task_id: string | null;
  issue_id: string | null;
  project_id: string;
  employee_id: string | null;
  date_logged: string;
  hours: number;
  note: string | null;
  source: "timer" | "manual";
  owner_name: string | null;
  owner_email: string | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
};

function resolveOwnerName(row: TimeLogRow, profileNames: Map<string, string>): string {
  if (row.employee_id) {
    const name = profileNames.get(row.employee_id);
    if (name) return name;
  }
  return row.owner_name || row.owner_email || "Unknown";
}

function truncateNote(note: string | null): string {
  if (!note) return "General log";
  const trimmed = note.trim();
  if (trimmed.length <= 80) return trimmed || "General log";
  return `${trimmed.slice(0, 79)}…`;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = profile?.role ?? null;
  if (!role || role === "client" || role === "marketing") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const projectId = searchParams.get("project_id");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  }

  const viewAll = VIEW_ALL_ROLES.includes(role);

  // .range() loop — a wide, view-all Range filter can exceed PostgREST's 1000-row default cap
  // (see CLAUDE.md's pagination rule; zoho-import/timelogs/route.ts is the canonical precedent).
  // The PDF export downstream relies on this route returning the *complete* filtered set.
  const rows: TimeLogRow[] = [];
  let offset = 0;
  for (;;) {
    let q = supabase
      .from("time_logs")
      .select("id, task_id, issue_id, project_id, employee_id, date_logged, hours, note, source, owner_name, owner_email, start_time, end_time, created_at")
      .gte("date_logged", from)
      .lte("date_logged", to)
      .order("date_logged", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (!viewAll) q = q.eq("employee_id", user.id);
    if (projectId) q = q.eq("project_id", projectId);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    rows.push(...((data ?? []) as TimeLogRow[]));
    if (!data || data.length < PAGE) break;
    offset += PAGE;
  }

  const employeeIds = [...new Set(rows.map((r) => r.employee_id).filter((id): id is string => !!id))];
  const profileNames = new Map<string, string>();
  if (employeeIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", employeeIds);
    for (const p of profiles ?? []) {
      if (p.full_name) profileNames.set(p.id, p.full_name);
    }
  }

  const projectIds = [...new Set(rows.map((r) => r.project_id).filter((id): id is string => !!id))];
  const projectNames = new Map<string, string>();
  const projectPublicIds = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data: projects } = await supabase.from("projects").select("id, name, project_id").in("id", projectIds);
    for (const p of projects ?? []) {
      projectNames.set(p.id, p.name);
      if (p.project_id) projectPublicIds.set(p.id, p.project_id);
    }
  }

  const taskIds = [...new Set(rows.map((r) => r.task_id).filter((id): id is string => !!id))];
  const taskTitles = new Map<string, string>();
  const taskDisplayIds = new Map<string, string>();
  if (taskIds.length > 0) {
    const { data: tasks } = await supabase.from("tasks").select("id, title, display_id").in("id", taskIds);
    for (const t of tasks ?? []) {
      taskTitles.set(t.id, t.title);
      if (t.display_id) taskDisplayIds.set(t.id, t.display_id);
    }
  }

  const issueIds = [...new Set(rows.map((r) => r.issue_id).filter((id): id is string => !!id))];
  const issueTitles = new Map<string, string>();
  const issueDisplayIds = new Map<string, string>();
  if (issueIds.length > 0) {
    const { data: issues } = await supabase.from("issues").select("id, title, display_id").in("id", issueIds);
    for (const i of issues ?? []) {
      issueTitles.set(i.id, i.title);
      if (i.display_id) issueDisplayIds.set(i.id, i.display_id);
    }
  }

  const entries = rows.map((r) => {
    const entryKind: "task" | "issue" | "general" = r.task_id ? "task" : r.issue_id ? "issue" : "general";
    const logTitle =
      entryKind === "task"
        ? taskTitles.get(r.task_id!) ?? "Untitled task"
        : entryKind === "issue"
          ? issueTitles.get(r.issue_id!) ?? "Untitled issue"
          : truncateNote(r.note);

    return {
      id: r.id,
      task_id: r.task_id,
      issue_id: r.issue_id,
      entry_kind: entryKind,
      project_id: r.project_id,
      project_name: projectNames.get(r.project_id) ?? "Unknown project",
      project_public_id: projectPublicIds.get(r.project_id) ?? null,
      task_title: r.task_id ? taskTitles.get(r.task_id) ?? "Untitled task" : "—",
      task_display_id: r.task_id ? taskDisplayIds.get(r.task_id) ?? null : null,
      issue_display_id: r.issue_id ? issueDisplayIds.get(r.issue_id) ?? null : null,
      log_title: logTitle,
      date_logged: r.date_logged,
      hours: r.hours,
      note: r.note,
      source: r.source,
      start_time: r.start_time,
      end_time: r.end_time,
      created_at: r.created_at,
      display_name: resolveOwnerName(r, profileNames),
      employee_id: r.employee_id,
      // Every entry this route resolves (task-linked, issue-linked, or general) is now editable
      // through the unified `/api/v2/time-logs/[timeLogId]` route (task 230) — the earlier
      // `&& !!r.task_id` restriction only existed because the old nested write route couldn't
      // reach a task-less row at all.
      can_edit: r.employee_id === user.id,
    };
  });

  return NextResponse.json({ entries, groupByUser: viewAll });
}

// POST /api/v2/time-logs — unified manual entry create (task 230). Unlike the existing
// `/api/v2/tasks/[taskId]/time-logs` nested route (still used by the task-detail page's own Time
// Logs tab, untouched by this task), this route isn't scoped to a single task in the URL — it
// accepts an optional `task_id` *or* `issue_id` in the body, or neither for a "General Log" entry
// (free text stored directly in `note`, per the task doc's Assumption 1). `hours` is always
// computed server-side from `start_time`/`end_time`, never trusted from the client, matching every
// other time-log write route in this codebase.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile?.role || profile.role === "client" || profile.role === "marketing") {
    return NextResponse.json({ error: "You do not have permission to log time" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const projectId = typeof body.project_id === "string" ? body.project_id : "";
  const taskId = typeof body.task_id === "string" && body.task_id ? body.task_id : null;
  const issueId = typeof body.issue_id === "string" && body.issue_id ? body.issue_id : null;
  const dateLogged = typeof body.date_logged === "string" ? body.date_logged : "";
  const startTime = typeof body.start_time === "string" ? body.start_time : "";
  const endTime = typeof body.end_time === "string" ? body.end_time : "";
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  if (!projectId) return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  if (taskId && issueId) {
    return NextResponse.json({ error: "An entry can be linked to a task or an issue, not both" }, { status: 400 });
  }
  if (!taskId && !issueId && !note) {
    return NextResponse.json({ error: "A General Log entry requires a description" }, { status: 400 });
  }
  if (!dateLogged || !startTime || !endTime) {
    return NextResponse.json({ error: "date_logged, start_time, and end_time are required" }, { status: 400 });
  }

  if (taskId) {
    const { data: task } = await supabase.from("tasks").select("id, assignees, project_id").eq("id", taskId).maybeSingle();
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    if (!task.assignees?.includes(user.id)) {
      return NextResponse.json({ error: "You must be assigned to this task to log time" }, { status: 403 });
    }
  } else if (issueId) {
    const { data: issue } = await supabase.from("issues").select("id, project_id").eq("id", issueId).maybeSingle();
    if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  const hours = (new Date(endTime).getTime() - new Date(startTime).getTime()) / 3_600_000;
  if (!(hours > 0) || hours > 24) {
    return NextResponse.json({ error: "End time must be after start time, and no more than 24 hours later" }, { status: 400 });
  }

  const { data: created, error } = await supabase
    .from("time_logs")
    .insert({
      task_id: taskId,
      issue_id: issueId,
      project_id: projectId,
      employee_id: user.id,
      date_logged: dateLogged,
      hours,
      note,
      source: "manual",
      billable: false,
      start_time: startTime,
      end_time: endTime,
    })
    .select("id, task_id, issue_id, project_id, date_logged, hours, note, source, start_time, end_time, created_at")
    .single();

  if (error) {
    console.error("[api/v2/time-logs] insert failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: callerProfile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();

  return NextResponse.json(
    { ...created, display_name: callerProfile?.full_name || user.email || "Unknown", can_edit: true },
    { status: 201 }
  );
}
