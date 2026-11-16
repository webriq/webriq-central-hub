// Task 475 — READ-ONLY dry run: align active phase / phase statuses to the PM tracker (Oct 15).
// Writes out/plan.md, out/apply.sql and out/rollback.sql for REVIEW. Never writes to the database.
// Run AFTER the task 455 kickoff apply.sql, so the start_date fallback reflects the new kickoff.
//
//   npx tsx --env-file=.env --tsconfig tsconfig.json _docs/task/475-phase-sync/dry-run.ts
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import type { Database } from "@/types/database";
import { planPhaseSync, type PhaseRow, type PhaseSyncPlan } from "./plan";

const url = process.env.BACKFILL_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.BACKFILL_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY!;
const target = /127\.0\.0\.1|localhost/.test(url) ? "LOCAL" : "LIVE (read-only)";
const sb = createClient<Database>(url, key, { auth: { persistSession: false } });
const OUT = "_docs/task/475-phase-sync/out";

type Move = { tracker: string; account: string; projectId: string; targetPhase?: number; completePhase?: number; why: string };
const MOVES: Move[] = [
  { tracker: "06", account: "Veteran Roofing & Exteriors", projectId: "C74DEA31-PROJ-02", targetPhase: 3, why: "tracker: Publish (Hub: AI Visibility)" },
  { tracker: "07", account: "Black Barn Dumpsters", projectId: "2CDA5C64-PROJ-02", targetPhase: 1, why: "tracker: Onboard, awaiting sign-off (Hub: Migrate & Rebrand)" },
  { tracker: "10", account: "RCB & Associates LLC", projectId: "5EBACF20-PROJ-01", targetPhase: 2, why: "tracker: Migrate & Rebrand, awaiting go-live (Hub: Publish)" },
  { tracker: "03", account: "Saginaw CFC", projectId: "C30DE6A5-PROJ-03", completePhase: 2, why: "D3: M&R handed over → completed, not skipped" },
];

const PM_CONFIRM = [
  "**#13 Royal Thumper (`FC6D83AB-PROJ-01`)**: tracker says Migrate & Rebrand, but the Hub moved it to Publish on 2026-11-10 (after the tracker). Not touched (Hub newer). PM to confirm.",
  "**#12 M&I Interiors (`D0A5D523-PROJ-04`)**: the tracker's \"Hub updates\" column says \"open Publish\", but its current phase is still Migrate & Rebrand. Not touched. PM to confirm.",
];

const lit = (v: string | boolean | null | undefined) =>
  v === null || v === undefined ? "null" : typeof v === "boolean" ? String(v) : `'${v.replace(/'/g, "''")}'`;
const setSql = (f: Record<string, unknown>) => Object.entries(f).map(([k, v]) => `${k} = ${lit(v as string | null)}`).join(", ");
// Byte-order sort to match the guard's `order by id::text collate "C"` (localeCompare follows ICU rules, not Postgres's).
const snapshot = (rows: { id: string; status: string }[]) => [...rows].sort((a, b) => (a.id < b.id ? -1 : 1)).map((r) => `${r.id}:${r.status}`).join(",");

async function main() {
  console.log(`Target: ${target}\n`);
  type Planned = { m: Move; uuid: string; snap: string; plan: PhaseSyncPlan; prevState: Map<string, { is_manual_override: boolean; override_note: string | null }> };
  const planned: Planned[] = [];
  const noop: string[] = [];
  const problems: string[] = [];

  for (const m of MOVES) {
    const { data: project, error } = await sb.from("projects").select("id, status").eq("project_id", m.projectId).maybeSingle();
    if (error) throw new Error(`${m.projectId}: ${error.message}`);
    if (!project || project.status === "deleted" || project.status === "archived") { problems.push(`#${m.tracker} ${m.account}: \`${m.projectId}\` not found or ${project?.status}. Skipped.`); continue; }

    const { data: rows, error: pErr } = await sb
      .from("project_phases")
      .select("id, phase_number, position, status, start_date, actual_start_date, actual_completed_date")
      .eq("project_id", project.id)
      .eq("source", "programme");
    if (pErr) throw new Error(`${m.projectId} phases: ${pErr.message}`);

    let plan: PhaseSyncPlan;
    try { plan = planPhaseSync((rows ?? []) as PhaseRow[], { targetPhase: m.targetPhase, completePhase: m.completePhase }); }
    catch (e) { problems.push(`#${m.tracker} ${m.account}: ${(e as Error).message}. Skipped.`); continue; }
    if (plan.updates.length === 0) { noop.push(`#${m.tracker} ${m.account} (\`${m.projectId}\`): already matches.`); continue; }

    const ids = plan.state.map((s) => s.phase_id);
    const { data: st, error: sErr } = ids.length
      ? await sb.from("phase_programme_state").select("phase_id, is_manual_override, override_note").in("phase_id", ids)
      : { data: [], error: null };
    if (sErr) throw new Error(`${m.projectId} state: ${sErr.message}`);
    planned.push({ m, uuid: project.id, snap: snapshot(rows ?? []), plan, prevState: new Map((st ?? []).map((s) => [s.phase_id, s])) });
  }

  const md: string[] = [
    `# Task 475: phase-sync plan`, ``, `Generated ${new Date().toISOString()} against ${target}. Nothing has been applied.`, ``,
    `## Changes (${planned.length})`, ``,
    `| # | Account | project_id | Why | Phase | Field | Now | After |`, `|---|---|---|---|---|---|---|---|`,
    ...planned.flatMap((p) => p.plan.updates.flatMap((u) => Object.keys(u.set).map((k) =>
      `| ${p.m.tracker} | ${p.m.account} | \`${p.m.projectId}\` | ${p.m.why} | P${u.phase_number} | ${k} | ${(u.from as Record<string, unknown>)[k] ?? "null"} | ${(u.set as Record<string, unknown>)[k] ?? "null"} |`))),
    ``, `## Already matching (${noop.length})`, ``, ...noop.map((n) => `- ${n}`),
    ``, `## Skipped / problems (${problems.length})`, ``, ...problems.map((n) => `- ${n}`),
    ``, `## PM to confirm (${PM_CONFIRM.length})`, ``, ...PM_CONFIRM.map((n) => `- ${n}`),
    ``, `## Not changed by this plan`, ``,
    `Kickoffs (task 455's apply.sql), delay/project notes and projects.status. No Cliq notifications are sent.`, ``,
  ];

  const apply = [`-- Task 475: phase sync. REVIEW out/plan.md first. Run once in the Supabase SQL editor, AFTER task 455's apply.sql.`, `-- Each project block aborts the whole transaction if its phase statuses changed since the dry run.`, `begin;`];
  const rollback = [`-- Task 475: rollback of apply.sql (restores the values read by the dry run).`, `begin;`];
  for (const p of planned) {
    apply.push(``, `-- #${p.m.tracker} ${p.m.account} (${p.m.projectId}, ${p.uuid})`);
    apply.push(`do $$ begin if (select string_agg(id::text || ':' || status, ',' order by id::text collate "C") from project_phases where project_id = ${lit(p.uuid)} and source = 'programme') is distinct from ${lit(p.snap)} then raise exception 'task 475: ${p.m.projectId} phase statuses changed since the dry run, re-run it'; end if; end $$;`);
    rollback.push(``, `-- #${p.m.tracker} ${p.m.account} (${p.m.projectId})`);
    // Demotions are already first in plan.updates; rollback runs them in reverse so the target is demoted before the old active is restored.
    for (const u of p.plan.updates) apply.push(`update project_phases set ${setSql(u.set)} where id = ${lit(u.id)};`);
    for (const u of [...p.plan.updates].reverse()) rollback.push(`update project_phases set ${setSql(u.from)} where id = ${lit(u.id)};`);
    for (const s of p.plan.state) {
      apply.push(`insert into phase_programme_state (phase_id, is_manual_override, override_note) values (${lit(s.phase_id)}, ${s.is_manual_override}, ${lit(s.override_note)}) on conflict (phase_id) do update set is_manual_override = excluded.is_manual_override, override_note = excluded.override_note;`);
      const prev = p.prevState.get(s.phase_id);
      rollback.push(prev
        ? `update phase_programme_state set is_manual_override = ${prev.is_manual_override}, override_note = ${lit(prev.override_note)} where phase_id = ${lit(s.phase_id)};`
        : `delete from phase_programme_state where phase_id = ${lit(s.phase_id)};`);
    }
  }
  apply.push(``, `commit;`, ``);
  rollback.push(``, `commit;`, ``);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/plan.md`, md.join("\n"));
  writeFileSync(`${OUT}/apply.sql`, apply.join("\n"));
  writeFileSync(`${OUT}/rollback.sql`, rollback.join("\n"));
  console.log(md.join("\n"));
  console.log(`\nWrote ${OUT}/plan.md, apply.sql, rollback.sql (NOT applied).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
