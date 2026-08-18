import type { SupabaseClient } from "@supabase/supabase-js";

// Attaches the active task's or issue's title, plus its project's name, for display in the
// hub-wide floating widget (which has no other access to task/issue/project data — it can
// render on any /v2/* page, not just a project's task list) and the timer-timeline popover.
// Task 234 widens this from task-only to also resolve an issue title when `issue_id` is set —
// the two are mutually exclusive on a row. Task 265 adds the project_name lookup.
export async function attachTaskTitle<T extends { task_id: string | null; issue_id: string | null; project_id: string | null }>(
  supabase: SupabaseClient,
  timer: T | null
): Promise<(T & { task_title: string | null; issue_title: string | null; project_name: string | null }) | null> {
  if (!timer) return null;

  const titleQuery = timer.task_id
    ? supabase.from("tasks").select("title").eq("id", timer.task_id).maybeSingle()
    : timer.issue_id
    ? supabase.from("issues").select("title").eq("id", timer.issue_id).maybeSingle()
    : null;
  const projectQuery = timer.project_id
    ? supabase.from("projects").select("name").eq("id", timer.project_id).maybeSingle()
    : null;

  const [titleResult, projectResult] = await Promise.all([
    titleQuery ?? Promise.resolve({ data: null }),
    projectQuery ?? Promise.resolve({ data: null }),
  ]);

  const project_name = (projectResult.data as { name?: string } | null)?.name ?? null;
  const title = (titleResult.data as { title?: string } | null)?.title ?? null;

  if (timer.task_id) return { ...timer, task_title: title, issue_title: null, project_name };
  if (timer.issue_id) return { ...timer, task_title: null, issue_title: title, project_name };
  return { ...timer, task_title: null, issue_title: null, project_name };
}
