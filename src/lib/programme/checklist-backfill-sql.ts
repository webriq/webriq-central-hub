import type { ChecklistOp, ChecklistPlan } from "./checklist-backfill";

// Task 434 — turns a ChecklistPlan into ONE transactional SQL script, for review only; the agent never runs it against the shared
// database. A drift guard at the top (the count of checklist task rows must still equal the snapshot) and a reconciliation assertion at
// the bottom make a stale or wrong script roll itself back. Pattern of task 428's backfill-sql.ts.
const lit = (v: unknown): string => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};

const insertStmt = (op: ChecklistOp): string => {
  const cols = ["id", ...Object.keys(op.row)];
  return `insert into tasks (${cols.join(", ")}) values (${[lit(op.id), ...Object.values(op.row).map(lit)].join(", ")});`;
};
const updateStmt = (op: ChecklistOp): string => {
  const { status, is_completed, completed_on, completion_percentage, milestone_id, tasklist_id } = op.row;
  const set = Object.entries({ status, is_completed, completed_on, completion_percentage, milestone_id, tasklist_id }).map(([k, v]) => `${k} = ${lit(v)}`).join(", ");
  return `update tasks set ${set}, updated_at = now() where id = ${lit(op.id)} and kind = 'checklist';`;
};

export function checklistPlanToSql(plan: ChecklistPlan, snapshot: { existingChecklistTasks: number }): string {
  const inserts = plan.ops.filter((o) => o.action === "insert");
  const updates = plan.ops.filter((o) => o.action === "update");
  const unchanged = plan.ops.length - inserts.length - updates.length;
  const expected = snapshot.existingChecklistTasks + inserts.length;
  return [
    `-- Task 434 checklist backfill (generated). Plan: insert ${inserts.length} / update ${updates.length} / unchanged ${unchanged}; projects skipped ${plan.skippedProjects.length}; items skipped ${plan.skippedItems.length}.`,
    "-- Run as a superuser (Supabase SQL editor) AFTER migration 163 and the programme migrations (160/161). One transaction; any failed guard rolls everything back.",
    "begin;",
    `do $$ begin
  if (select count(*) from tasks where kind = 'checklist') <> ${snapshot.existingChecklistTasks} then raise exception 'DRIFT: checklist task count changed since the plan was generated'; end if;
end $$;`,
    ...inserts.map(insertStmt),
    ...updates.map(updateStmt),
    `do $$ begin
  if (select count(*) from tasks where kind = 'checklist') <> ${expected} then raise exception 'RECONCILE: expected ${expected} checklist tasks after the backfill'; end if;
end $$;`,
    "commit;",
    "",
  ].join("\n");
}
