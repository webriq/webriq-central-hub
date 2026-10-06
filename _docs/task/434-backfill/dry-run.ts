// Task 434 — READ-ONLY dry run. Reads the legacy onboarding checklist + the unified programme tables (+ any checklist tasks that already
// exist), plans the backfill with the pure planner, prints the report and writes out/plan.json + out/backfill.sql (for review; NEVER
// executed by this script). Pattern of _docs/task/428-backfill/dry-run.ts.
//   NODE_OPTIONS=--experimental-websocket node --env-file=.env node_modules/tsx/dist/cli.mjs _docs/task/434-backfill/dry-run.ts
// Local test target:  BACKFILL_SUPABASE_URL=http://127.0.0.1:54321 BACKFILL_SECRET_KEY=<local service key> ...
// Before migration 163 the `existing` read (tasks.kind / checklist_key) fails; that is reported and treated as "none yet".
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { planChecklistBackfill, summariseChecklistPlan, type ChecklistBackfillInput } from "@/lib/programme/checklist-backfill";
import { checklistPlanToSql } from "@/lib/programme/checklist-backfill-sql";

const url = process.env.BACKFILL_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.BACKFILL_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY!;
const target = /127\.0\.0\.1|localhost/.test(url) ? "LOCAL" : "LIVE (read-only)";
const sb = createClient(url, key, { auth: { persistSession: false } });
const OUT = "_docs/task/434-backfill/out";

async function all<T>(table: string, cols: string, eq?: [column: string, value: string]): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const q = sb.from(table).select(cols);
    const { data, error } = await (eq ? q.eq(eq[0], eq[1]) : q).range(from, from + 999);
    if (error) return { rows: [], error: error.message };
    rows.push(...(data as unknown as T[]));
    if (data.length < 1000) break;
  }
  return { rows, error: null };
}
const must = <T>(r: { rows: T[]; error: string | null }, what: string): T[] => {
  if (r.error) throw new Error(`${what}: ${r.error}`);
  return r.rows;
};

async function main() {
  console.log(`Target: ${target}\n`);
  const [phases, deliverables, legacy, existingRes] = await Promise.all([
    all<ChecklistBackfillInput["phases"][number]>("project_phases", "id,project_id,phase_number", ["source", "programme"]),
    all<ChecklistBackfillInput["deliverables"][number]>("project_deliverables", "id,project_id,phase_id,deliverable_key", ["source", "programme"]),
    all<ChecklistBackfillInput["legacy"][number]>("onboarding_internal_deliverables", "project_id,deliverable_key,status"),
    all<ChecklistBackfillInput["existing"][number]>("tasks", "id,project_id,checklist_key,status,milestone_id,tasklist_id", ["kind", "checklist"]),
  ]);
  if (existingRes.error) console.log(`NOTE: could not read existing checklist tasks (${existingRes.error}) — migration 163 not applied? Treating as none.\n`);

  const plan = planChecklistBackfill({
    phases: must({ rows: phases.rows, error: phases.error }, "project_phases"),
    deliverables: must({ rows: deliverables.rows, error: deliverables.error }, "project_deliverables"),
    legacy: must({ rows: legacy.rows, error: legacy.error }, "onboarding_internal_deliverables"),
    existing: existingRes.rows,
    now: new Date().toISOString(),
    newId: randomUUID,
  });
  const summary = summariseChecklistPlan(plan);
  console.log(JSON.stringify({ inputs: { legacy_rows: legacy.rows.length, projects_with_legacy: new Set(legacy.rows.map((r) => r.project_id)).size, existing_checklist_tasks: existingRes.rows.length }, ...summary }, null, 2));

  console.log("\nProjects skipped (no task rows; legacy rows untouched):");
  for (const s of plan.skippedProjects.slice(0, 40)) console.log(`  ${s.project_id}: ${s.reason}`);
  if (plan.skippedItems.length) console.log(`\nItems skipped inside otherwise-migrated projects: ${plan.skippedItems.length} (first 20)`);
  for (const s of plan.skippedItems.slice(0, 20)) console.log(`  ${s.project_id} ${s.checklist_key}: ${s.reason}`);
  if (plan.unknownLegacyKeys.length) { console.log("\nUnknown legacy deliverable_keys (not in INTERNAL_DELIVERABLES; not migrated):"); plan.unknownLegacyKeys.slice(0, 40).forEach((u) => console.log(`  ${u.project_id} ${u.deliverable_key}`)); }
  if (plan.ambiguities.length) { console.log("\nAMBIGUITIES (do not apply until resolved):"); plan.ambiguities.forEach((a) => console.log("  - " + a)); }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/plan.json`, JSON.stringify({ target, generatedAt: new Date().toISOString(), summary, plan }, null, 1));
  const sql = checklistPlanToSql(plan, { existingChecklistTasks: existingRes.rows.length });
  writeFileSync(`${OUT}/backfill.sql`, sql);
  console.log(`\nWrote ${OUT}/plan.json and ${OUT}/backfill.sql (${sql.split("\n").length} lines). Nothing was written to the database.`);
  if (plan.ambiguities.length) process.exitCode = 3;
}
main().then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(e); process.exit(1); });
