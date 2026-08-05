import type { SupabaseClient } from "@supabase/supabase-js";

// Attaches the active task's title for display in the hub-wide floating widget (which has no
// other access to task data — it can render on any /v2/* page, not just a project's task list).
export async function attachTaskTitle<T extends { task_id: string | null }>(
  supabase: SupabaseClient,
  timer: T | null
): Promise<(T & { task_title: string | null }) | null> {
  if (!timer) return null;
  if (!timer.task_id) return { ...timer, task_title: null };
  const { data } = await supabase.from("tasks").select("title").eq("id", timer.task_id).maybeSingle();
  return { ...timer, task_title: data?.title ?? null };
}
