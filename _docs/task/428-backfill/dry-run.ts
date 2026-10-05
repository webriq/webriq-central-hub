// Task 428 — READ-ONLY dry run. Reads customer_phases/customer_deliverables + the unified tables, plans the backfill with the
// pure planner, prints the report and writes out/plan.json + out/backfill.sql (for review; NEVER executed by this script).
//   NODE_OPTIONS=--experimental-websocket node --env-file=.env node_modules/tsx/dist/cli.mjs _docs/task/428-backfill/dry-run.ts
// Local test target:  BACKFILL_SUPABASE_URL=http://127.0.0.1:54321 BACKFILL_SECRET_KEY=<local service key> ...
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { planBackfill, summarisePlan, type CustomerDeliverableIn, type CustomerPhaseIn, type ExistingDeliverable, type ExistingPhase, type ProjectIn } from "@/lib/programme/backfill-plan";
import { planToSql } from "@/lib/programme/backfill-sql";

const url = process.env.BACKFILL_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.BACKFILL_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY!;
const target = /127\.0\.0\.1|localhost/.test(url) ? "LOCAL" : "LIVE (read-only)";
const sb = createClient(url, key, { auth: { persistSession: false } });
type Row = Record<string, unknown>;
async function all<T>(table: string, cols: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as T[]));
    if (data.length < 1000) break;
  }
  return rows;
}

async function main() {
  console.log(`Target: ${target}\n`);
  const [projects, phases, deliverables, existingPhases, existingDeliverables, tasks] = await Promise.all([
    all<ProjectIn>("projects", "id,project_id,programme_started_at,programme_duration_days,draft_skip_phase_numbers"),
    all<CustomerPhaseIn>("customer_phases", "project_id,phase_number,status,sort_order,actual_start_date,actual_completed_date,is_manual_override,override_note,delay_note,wizard_data,custom_name,day_start_override,day_end_override"),
    all<CustomerDeliverableIn>("customer_deliverables", "project_id,phase_number,deliverable_key,status,completed_at,custom_name,custom_description,custom_owner,day_start_override,day_end_override"),
    all<ExistingPhase>("project_phases", "id,project_id,external_id,name,description,start_date,due_date,status,position,day_start,day_end,phase_number,owner_label,actual_start_date,actual_completed_date,source"),
    all<ExistingDeliverable>("project_deliverables", "id,project_id,external_id,phase_id,name,description,owner_label,start_date,due_date,day_start,day_end,position,status,completed_at,deliverable_key,source,is_default"),
    all<Row>("tasks", "tasklist_id"),
  ]);
  const taskCountByDeliverable = new Map<string, number>();
  for (const t of tasks) if (t.tasklist_id) taskCountByDeliverable.set(t.tasklist_id as string, (taskCountByDeliverable.get(t.tasklist_id as string) ?? 0) + 1);

  const plan = planBackfill({ projects, phases, deliverables, existingPhases, existingDeliverables, taskCountByDeliverable, newId: randomUUID });
  const summary = summarisePlan(plan);
  console.log(JSON.stringify({ inputs: { projects: projects.length, customer_phases: phases.length, customer_deliverables: deliverables.length, project_phases: existingPhases.length, project_deliverables: existingDeliverables.length }, ...summary }, null, 2));

  console.log("\nOrphan programme-tagged rows (kept as manual, never deleted):");
  for (const o of plan.orphans.slice(0, 40)) console.log(`  ${o.kind} ${o.id} project=${o.project_id} ext=${o.external_id} tasks=${o.hasTasks ? "yes" : "no"}`);
  if (plan.ambiguities.length) { console.log("\nAMBIGUITIES (apply refuses to run until resolved):"); plan.ambiguities.forEach((a) => console.log("  - " + a)); }

  mkdirSync("_docs/task/428-backfill/out", { recursive: true });
  writeFileSync("_docs/task/428-backfill/out/plan.json", JSON.stringify({ target, generatedAt: new Date().toISOString(), summary, plan }, null, 1));
  const sql = planToSql(plan, { existingPhases, existingDeliverables });
  writeFileSync("_docs/task/428-backfill/out/backfill.sql", sql);
  console.log(`\nWrote out/plan.json and out/backfill.sql (${sql.split("\n").length} lines). Nothing was written to the database.`);
  if (plan.ambiguities.length) process.exitCode = 3;
}
main().then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(e); process.exit(1); });
