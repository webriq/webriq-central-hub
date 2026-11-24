import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { generalTasklistId } from "@/app/(hub)/projects/_shared/_tasks/_task-tree";

type Tasklist = Database["public"]["Tables"]["tasklists"]["Row"];
export type PhaseTasklist =
  | { tasklistId: string; created: Tasklist | null }
  | { error: string; status: number };

// Task 502 — the task list a "move to phase" lands in. The Tasks tab derives a task's phase from its
// list (tasks.tasklist_id → tasklists.milestone_id), so moving by phase means picking a list:
//   • milestoneId set  → that phase's first list (same order as the tree: position, then created_at);
//                        none yet → create one named after the phase (D1).
//   • milestoneId null → the project's General list (migration 183 keeps one per project).
// Runs on the caller's session. `canCreateList` mirrors tasklists_pm_write RLS (admin | super_admin | pm);
// the 42501 check below is the backstop if the two ever drift.
export const LIST_CREATE_ROLES = ["admin", "super_admin", "pm"];
const PM_ONLY = { error: "Only a PM can add this phase's first task list", status: 403 } as const;

export async function resolvePhaseTasklist(
  supabase: SupabaseClient<Database>,
  projectUuid: string,
  milestoneId: string | null,
  canCreateList: boolean,
): Promise<PhaseTasklist> {
  if (milestoneId === null) {
    const { data: lists } = await supabase.from("tasklists").select("id, name, milestone_id").eq("project_id", projectUuid);
    const id = generalTasklistId(lists ?? []);
    return id ? { tasklistId: id, created: null } : { error: "This project has no General list", status: 409 };
  }

  const { data: milestone } = await supabase.from("milestones").select("id, name, project_id").eq("id", milestoneId).maybeSingle();
  if (!milestone || milestone.project_id !== projectUuid) return { error: "Phase not found in this project", status: 400 };

  const { data: existing } = await supabase
    .from("tasklists")
    .select("id")
    .eq("milestone_id", milestoneId)
    .order("position", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) return { tasklistId: existing.id, created: null };
  if (!canCreateList) return PM_ONLY;

  const { data: created, error } = await supabase
    .from("tasklists")
    .insert({ project_id: projectUuid, name: milestone.name, milestone_id: milestoneId, position: 1 })
    .select()
    .single();
  if (error || !created) {
    if (error?.code === "42501") return PM_ONLY; // RLS denied the insert
    console.error("[resolvePhaseTasklist] create failed:", error?.message);
    return { error: error?.message ?? "Couldn't create the task list", status: 500 };
  }
  return { tasklistId: created.id, created };
}
