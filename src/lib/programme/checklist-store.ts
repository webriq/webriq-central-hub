import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, OnboardingInternalDeliverableRow } from "@/types/database";
import { completionColumns, mergeInternalRows, toInternalRows, type ChecklistStatus } from "./checklist-tasks";

// Task 434 — data access for the Phase 1 onboarding checklist now stored as `tasks` rows (kind = 'checklist'). During the soak the legacy
// `onboarding_internal_deliverables` table is dual-written and stays the fallback, so every function here degrades instead of failing when
// migration 163 hasn't been applied or a project hasn't been seeded/backfilled yet.
type Client = SupabaseClient<Database>;
type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];

/**
 * The project's checklist statuses in the legacy row shape. `tasks` rows win per key; the legacy table fills every key without a task
 * (all of them before migration 163 / backfill, where the `tasks` read errors or comes back empty). Only the legacy read's error is surfaced.
 */
export async function loadInternalDeliverables(client: Client, projectId: string): Promise<{ data: OnboardingInternalDeliverableRow[]; error: { message: string } | null }> {
  const [tasks, legacy] = await Promise.all([
    client.from("tasks").select("id, project_id, checklist_key, status, created_at, updated_at").eq("project_id", projectId).eq("kind", "checklist"),
    client.from("onboarding_internal_deliverables").select("*").eq("project_id", projectId),
  ]);
  const fromTasks = tasks.error ? [] : toInternalRows(tasks.data);
  return { data: mergeInternalRows(fromTasks, legacy.data ?? []), error: legacy.error };
}

/**
 * Mirror a checklist status change onto its `tasks` row. Update-only on purpose: creating a lone row for a project that was never
 * seeded/backfilled would make reads switch to a partial `tasks` view. Best-effort — the legacy table is authoritative during the soak.
 */
export async function syncChecklistTask(client: Client, projectId: string, checklistKey: string, status: ChecklistStatus): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await client
    .from("tasks")
    .update({ ...completionColumns(status, now), updated_at: now })
    .eq("project_id", projectId)
    .eq("kind", "checklist")
    .eq("checklist_key", checklistKey);
  if (error) console.error("syncChecklistTask error:", error.message);
}

/** Best-effort insert of freshly built checklist rows (seed). A failure is logged, never thrown — legacy rows remain the source of truth. */
export async function insertChecklistTasks(client: Client, rows: TaskInsert[], label: string): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await client.from("tasks").insert(rows);
  if (error) console.error(`${label}: checklist tasks insert error (non-fatal during the dual-write soak):`, error.message);
}
