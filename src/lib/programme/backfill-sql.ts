import type { ExistingDeliverable, ExistingPhase, PhaseOp, Plan } from "./backfill-plan";

// Task 428 — turns a Plan into ONE transactional SQL script. It is only ever written to a file for review; the agent never
// runs it against the shared database. Drift guards at the top (row counts must still equal the snapshot the plan was built
// from) and reconciliation assertions at the bottom make a wrong or stale script roll itself back.

const lit = (v: unknown): string => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};
const json = (v: unknown) => `'${JSON.stringify(v ?? {}).replace(/'/g, "''")}'::jsonb`;
const uuidList = (ids: string[]) => ids.map(lit).join(", ");

function assignments(row: Record<string, unknown>): string {
  return Object.entries(row).map(([k, v]) => `${k} = ${lit(v)}`).join(", ");
}
function insertStmt(table: string, id: string, row: Record<string, unknown>): string {
  const cols = ["id", ...Object.keys(row)];
  return `insert into ${table} (${cols.join(", ")}) values (${[lit(id), ...Object.values(row).map(lit)].join(", ")});`;
}

export function planToSql(plan: Plan, snapshot: { existingPhases: ExistingPhase[]; existingDeliverables: ExistingDeliverable[] }): string {
  const insPh = plan.phases.filter((p) => p.action === "insert");
  const updPh = plan.phases.filter((p) => p.action === "update");
  const insDl = plan.deliverables.filter((d) => d.action === "insert");
  const updDl = plan.deliverables.filter((d) => d.action === "update");
  const orphanDl = plan.orphans.filter((o) => o.kind === "deliverable").map((o) => o.id);
  const orphanPh = plan.orphans.filter((o) => o.kind === "phase").map((o) => o.id);
  const stateOps: PhaseOp[] = plan.phases.filter((p) => p.action !== "unchanged");
  const expectPhases = snapshot.existingPhases.length + insPh.length;
  const expectDeliverables = snapshot.existingDeliverables.length + insDl.length;
  const out: string[] = [];

  out.push(`-- Task 428 backfill (generated). Plan: phases insert ${insPh.length} / update ${updPh.length} / unchanged ${plan.phases.length - insPh.length - updPh.length}; deliverables insert ${insDl.length} / update ${updDl.length} / unchanged ${plan.deliverables.length - insDl.length - updDl.length}; orphans kept manual ${plan.orphans.length}.`);
  out.push("-- Run as a superuser (Supabase SQL editor) AFTER migrations 160 + 161. One transaction; any failed guard rolls everything back.");
  out.push("begin;");
  out.push(`do $$ begin
  if (select count(*) from project_phases) <> ${snapshot.existingPhases.length} then raise exception 'DRIFT: project_phases count changed since the plan was generated'; end if;
  if (select count(*) from project_deliverables) <> ${snapshot.existingDeliverables.length} then raise exception 'DRIFT: project_deliverables count changed since the plan was generated'; end if;
  if to_regclass('public.phase_programme_state') is null or not exists (select 1 from pg_indexes where indexname = 'project_deliverables_phase_key_uq') then raise exception 'PREREQUISITE: apply migrations 160 and 161 first'; end if;
end $$;`);

  out.push("\n-- ── phases: update existing (merge / rewrite legacy external_id) ──");
  for (const p of updPh) out.push(`update project_phases set ${assignments(p.row as unknown as Record<string, unknown>)} where id = ${lit(p.id)};`);
  out.push("\n-- ── phases: insert missing ──");
  for (const p of insPh) out.push(insertStmt("project_phases", p.id, p.row as unknown as Record<string, unknown>));
  out.push("\n-- ── programme state (wizard data, overrides, notes) ──");
  for (const p of stateOps) {
    out.push(`insert into phase_programme_state (phase_id, wizard_data, is_manual_override, override_note, delay_note) values (${lit(p.state.phase_id)}, ${json(p.state.wizard_data)}, ${lit(p.state.is_manual_override)}, ${lit(p.state.override_note)}, ${lit(p.state.delay_note)}) on conflict (phase_id) do update set wizard_data = excluded.wizard_data, is_manual_override = excluded.is_manual_override, override_note = excluded.override_note, delay_note = excluded.delay_note, updated_at = now();`);
  }
  out.push("\n-- ── deliverables: update existing ──");
  for (const d of updDl) out.push(`update project_deliverables set ${assignments(d.row as unknown as Record<string, unknown>)} where id = ${lit(d.id)};`);
  out.push("\n-- ── deliverables: insert missing ──");
  for (const d of insDl) out.push(insertStmt("project_deliverables", d.id, d.row as unknown as Record<string, unknown>));
  out.push("\n-- ── orphan programme-tagged rows: keep, but as manual (PM-editable); never deleted ──");
  if (orphanDl.length) out.push(`update project_deliverables set source = 'manual' where id in (${uuidList(orphanDl)});`);
  if (orphanPh.length) out.push(`update project_phases set source = 'manual' where id in (${uuidList(orphanPh)});`);

  out.push(`\n-- ── reconciliation: abort (roll back) unless the result is exactly what the plan says ──
do $$ begin
  if (select count(*) from project_phases) <> ${expectPhases} then raise exception 'RECONCILE: project_phases count'; end if;
  if (select count(*) from project_deliverables) <> ${expectDeliverables} then raise exception 'RECONCILE: project_deliverables count'; end if;
  if (select count(*) from project_phases where source = 'programme') <> ${plan.phases.length} then raise exception 'RECONCILE: programme phase rows <> customer_phases rows'; end if;
  if (select count(*) from project_deliverables where source = 'programme') <> ${plan.deliverables.length} then raise exception 'RECONCILE: programme deliverable rows <> customer_deliverables rows'; end if;
  if (select count(*) from phase_programme_state) < ${plan.phases.length} then raise exception 'RECONCILE: state rows'; end if;
  if exists (select 1 from project_phases where source = 'programme' and (phase_number is null or external_id is null)) then raise exception 'RECONCILE: programme phase without number/external_id'; end if;
  if exists (select 1 from project_deliverables d where d.source = 'programme' and (d.deliverable_key is null or d.phase_id is null)) then raise exception 'RECONCILE: programme deliverable without key/phase'; end if;
  if (select count(*) from tasks where milestone_id is not null and milestone_id not in (select id from project_phases)) <> 0 then raise exception 'RECONCILE: a task lost its phase link'; end if;
  if (select count(*) from tasks where tasklist_id is not null and tasklist_id not in (select id from project_deliverables)) <> 0 then raise exception 'RECONCILE: a task lost its deliverable link'; end if;
end $$;
commit;`);
  return out.join("\n") + "\n";
}

