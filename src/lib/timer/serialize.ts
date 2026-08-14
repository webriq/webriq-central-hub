import type { SupabaseClient } from "@supabase/supabase-js";

// Attaches the active task's or issue's title for display in the hub-wide floating widget
// (which has no other access to task/issue data — it can render on any /v2/* page, not just a
// project's task list) and the timer-timeline popover. Task 234 widens this from task-only to
// also resolve an issue title when `issue_id` is set — the two are mutually exclusive on a row.
export async function attachTaskTitle<T extends { task_id: string | null; issue_id: string | null }>(
  supabase: SupabaseClient,
  timer: T | null
): Promise<(T & { task_title: string | null; issue_title: string | null }) | null> {
  if (!timer) return null;
  if (timer.task_id) {
    const { data } = await supabase.from("tasks").select("title").eq("id", timer.task_id).maybeSingle();
    return { ...timer, task_title: data?.title ?? null, issue_title: null };
  }
  if (timer.issue_id) {
    const { data } = await supabase.from("issues").select("title").eq("id", timer.issue_id).maybeSingle();
    return { ...timer, task_title: null, issue_title: data?.title ?? null };
  }
  return { ...timer, task_title: null, issue_title: null };
}
