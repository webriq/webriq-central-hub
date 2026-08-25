import type { SupabaseClient } from "@supabase/supabase-js";

// Attaches the active task's or issue's title, plus its project's name, for display in the
// hub-wide header timer widget (which has no other access to task/issue/project data — it can
// render on any /v2/* page, not just a project's task list) and the timer-timeline popover.
// Task 234 widens this from task-only to also resolve an issue title when `issue_id` is set —
// the two are mutually exclusive on a row. Task 265 adds the project_name lookup. Task 300 adds
// the display_id/project_id (display) lookups so the header widget can link to detail pages.
export async function attachTaskTitle<T extends { task_id: string | null; issue_id: string | null; project_id: string | null }>(
  supabase: SupabaseClient,
  timer: T | null
): Promise<(T & {
  task_title: string | null; task_display_id: string | null;
  issue_title: string | null; issue_display_id: string | null;
  project_name: string | null; project_display_id: string | null;
}) | null> {
  if (!timer) return null;

  const titleQuery = timer.task_id
    ? supabase.from("tasks").select("title, display_id").eq("id", timer.task_id).maybeSingle()
    : timer.issue_id
    ? supabase.from("issues").select("title, display_id").eq("id", timer.issue_id).maybeSingle()
    : null;
  const projectQuery = timer.project_id
    ? supabase.from("projects").select("name, project_id").eq("id", timer.project_id).maybeSingle()
    : null;

  const [titleResult, projectResult] = await Promise.all([
    titleQuery ?? Promise.resolve({ data: null }),
    projectQuery ?? Promise.resolve({ data: null }),
  ]);

  const projectRow = projectResult.data as { name?: string; project_id?: string } | null;
  const project_name = projectRow?.name ?? null;
  const project_display_id = projectRow?.project_id ?? null;

  const titleRow = titleResult.data as { title?: string; display_id?: string } | null;
  const title = titleRow?.title ?? null;
  const display_id = titleRow?.display_id ?? null;

  if (timer.task_id) return { ...timer, task_title: title, task_display_id: display_id, issue_title: null, issue_display_id: null, project_name, project_display_id };
  if (timer.issue_id) return { ...timer, task_title: null, task_display_id: null, issue_title: title, issue_display_id: display_id, project_name, project_display_id };
  return { ...timer, task_title: null, task_display_id: null, issue_title: null, issue_display_id: null, project_name, project_display_id };
}
