// Task 468 — read both projects into plain ProjectData snapshots. Reads use the caller's session client (RLS).
// Task 430 renames tasks.milestone_id/tasklist_id → phase_id/deliverable_id: change COLS.* in one place.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectData, TaskRow } from "./plan";

export type Db = SupabaseClient;

export const COLS = { milestone: "milestone_id", tasklist: "tasklist_id" } as const;

type PageQuery = (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { code?: string; message: string } | null }>;

/** PostgREST truncates silently at 1000 rows — loop `.range` until a short page (CLAUDE.md). */
export async function fetchAll<T>(page: PageQuery): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

async function loadTasks(db: Db, id: string): Promise<TaskRow[]> {
  const select = (cols: string) => (from: number, to: number) =>
    db.from("tasks").select(cols).eq("project_id", id).order("id").range(from, to);
  const cols = `id,title,status,parent_task_id,${COLS.tasklist},${COLS.milestone}`;
  let rows: Record<string, unknown>[];
  try {
    rows = await fetchAll(select(`${cols},kind,checklist_key`));
  } catch (e) {
    // migration 163 (kind/checklist_key) not applied — nothing to exclude
    if ((e as { code?: string }).code !== "42703") throw e;
    rows = await fetchAll(select(cols));
  }
  return rows.map((r) => ({
    id: r.id as string, title: (r.title as string) ?? "", status: r.status as string, parent_task_id: (r.parent_task_id as string) ?? null,
    tasklist_id: (r[COLS.tasklist] as string) ?? null, milestone_id: (r[COLS.milestone] as string) ?? null,
    kind: (r.kind as string) ?? "task", checklist_key: (r.checklist_key as string) ?? null,
  }));
}

const all = <T>(db: Db, table: string, cols: string, id: string, col = "project_id") =>
  fetchAll<T>((from, to) => db.from(table).select(cols).eq(col, id).order("id").range(from, to));

const count = async (db: Db, table: string, id: string) => {
  const { count: n, error } = await db.from(table).select("id", { count: "exact", head: true }).eq("project_id", id);
  return error ? 0 : n ?? 0;
};

export async function loadProject(db: Db, id: string): Promise<ProjectData | null> {
  const { data: p } = await db.from("projects").select("id,name,customer_id").eq("id", id).maybeSingle();
  if (!p) return null;
  const [tasks, tasklists, milestones, tickets, folders, files, logs, members, noteCount, timers, programme] = await Promise.all([
    loadTasks(db, id),
    all<ProjectData["tasklists"][number]>(db, "tasklists", "id,name", id),
    all<ProjectData["milestones"][number]>(db, "milestones", "id,name,status", id),
    all<ProjectData["tickets"][number]>(db, "tickets", "id,title,status", id),
    all<ProjectData["folders"][number]>(db, "customer_asset_folders", "id,name,parent_folder_id,phase_number", id),
    all<ProjectData["files"][number]>(db, "customer_assets", "id,label,type,folder_id,file_size", id),
    all<ProjectData["logs"][number]>(db, "time_logs", "id,task_id,employee_id,date_logged,hours,note", id),
    all<{ user_id: string }>(db, "project_members", "user_id", id),
    count(db, "notes", id),
    count(db, "active_timers", id),
    count(db, "customer_phases", id),
  ]);
  return {
    id, name: p.name as string, customerId: p.customer_id as string,
    tasks, tasklists, milestones, tickets, folders, files, logs,
    memberIds: members.map((m) => m.user_id), noteCount,
    runningTimers: Array(timers).fill("timer"), hasProgramme: programme > 0,
  };
}
