// Task 428 — READ-ONLY on live: writes out/snapshot.sql, a copy of the rows the backfill touches, for loading into the
// DISPOSABLE LOCAL database (via _docs/task/427-spike/spike.sh, which refuses non-local targets). Contains live data; lives in
// the git-ignored out/ folder.   NODE_OPTIONS=--experimental-websocket node --env-file=.env node_modules/tsx/dist/cli.mjs _docs/task/428-backfill/snapshot-to-local.ts
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
type Row = Record<string, unknown>;
async function all(table: string, cols: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Row[]));
    if (data.length < 1000) break;
  }
  return rows;
}
// Full rows (select *): every column is present, so populate_recordset is exact.
const insert = (table: string, rows: Row[]) => `insert into ${table} select * from jsonb_populate_recordset(null::${table}, $j$${JSON.stringify(rows)}$j$::jsonb);`;
// Partial rows: list the columns so omitted ones keep their defaults (populate_recordset would insert explicit NULLs).
const insertCols = (table: string, cols: string, rows: Row[]) => `insert into ${table} (${cols.split(",").map((c) => c.trim().split(" ")[0]).join(", ")}) select * from jsonb_to_recordset($j$${JSON.stringify(rows)}$j$::jsonb) as t(${cols});`;

async function main() {
  const customers = await all("customers", "id,customer_id,company_name");
  const projects = await all("projects", "id,customer_id,name,project_type,project_id,status,programme_started_at,programme_duration_days,draft_skip_phase_numbers");
  const cp = await all("customer_phases", "*");
  const cd = await all("customer_deliverables", "*");
  const phases = (await all("project_phases", "*")).map((r) => ({ ...r, created_by: null }));
  const deliverables = await all("project_deliverables", "*");
  const tasks = await all("tasks", "id,project_id,title,milestone_id,tasklist_id");
  const sql = [
    "-- Task 428 local snapshot (generated; LOCAL disposable DB only)", "begin;",
    insertCols("customers", "id uuid, customer_id text, company_name text", customers),
    insertCols("projects", "id uuid, customer_id text, name text, project_type text, project_id text, status text, programme_started_at timestamptz, programme_duration_days int, draft_skip_phase_numbers int[]", projects), insert("customer_phases", cp), insert("customer_deliverables", cd),
    insert("project_phases", phases), insert("project_deliverables", deliverables), insertCols("tasks", "id uuid, project_id uuid, title text, milestone_id uuid, tasklist_id uuid", tasks), "commit;",
  ].join("\n");
  writeFileSync("_docs/task/428-backfill/out/snapshot.sql", sql);
  console.log(JSON.stringify({ customers: customers.length, projects: projects.length, customer_phases: cp.length, customer_deliverables: cd.length, project_phases: phases.length, project_deliverables: deliverables.length, tasks: tasks.length, bytes: sql.length }));
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
