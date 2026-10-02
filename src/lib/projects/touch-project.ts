import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Task 417 — activity bumps for the Projects listing's "Recently accessed" sort (task 416).
// Route handlers call these after a successful qualifying write (comment, edit/status change,
// create, timer start/resume, time logged) so the acting user's recency for that project follows
// real work wherever it happens, not just page opens. Strictly best-effort:
//   * runs in after() — post-response, never delays or alters the route's reply
//   * cookies are readable inside after() in Route Handlers (Next 16 docs), so the client keeps the
//     caller's own session and project_views' own-row RLS — never adminClient
//   * every failure (incl. migration 157 not applied yet) is logged and swallowed
// The 60 s throttle and the "skip deleted projects" rule live in touch_project_view() itself.

// One best-effort call under the caller's own session; `resolve` maps whatever the route had
// (a project id, or a task id) to the project UUID.
async function touch(label: string, resolve: (supabase: Awaited<ReturnType<typeof createClient>>) => Promise<string | null | undefined>) {
  try {
    const supabase = await createClient();
    const projectId = await resolve(supabase);
    if (!projectId) return;
    const { error } = await supabase.rpc("touch_project_view", { p_project_id: projectId });
    if (error) console.warn(`[touch-project] ${label}: ${error.message}`);
  } catch (e) {
    console.warn(`[touch-project] ${label} failed:`, e instanceof Error ? e.message : e);
  }
}

export function touchProject(projectId: string | null | undefined): void {
  if (!projectId) return;
  after(() => touch(projectId, async () => projectId));
}

// For the task-comment routes, which only have a task id: resolves the owning project inside
// after(), still under the caller's session.
export function touchProjectForTask(taskId: string): void {
  after(() =>
    touch(`tasks/${taskId}`, async (supabase) => {
      const { data } = await supabase.from("tasks").select("project_id").eq("id", taskId).maybeSingle();
      return data?.project_id;
    })
  );
}
