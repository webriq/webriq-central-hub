// Task 455 — READ-ONLY dry run of the kickoff re-baseline. Sets each StackShift I programme's
// projects.programme_started_at to the PM-confirmed kickoff from the Oct 15 tracker, and re-derives the
// programme rows' start_date/due_date with the same pure function rematerialiseProgrammeDates() uses
// (materialiseDates). Writes out/plan.md, out/apply.sql and out/rollback.sql for REVIEW. It NEVER
// executes them and never writes to the database. Phase status / actual dates are not touched.
//
//   npx tsx --env-file=.env --tsconfig tsconfig.json _docs/task/455-kickoff-rebaseline/dry-run.ts
// Local test target:  BACKFILL_SUPABASE_URL=http://127.0.0.1:54321 BACKFILL_SECRET_KEY=<local service key> ...
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import type { Database } from "@/types/database";
import { materialiseDates, type DatePatch } from "@/lib/programme/programme-dates";
import { currentDisplayDay } from "@/lib/programme/calendar";
import { kickoffTimestamp } from "@/lib/programme/note-rules";

const url = process.env.BACKFILL_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.BACKFILL_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY!;
const target = /127\.0\.0\.1|localhost/.test(url) ? "LOCAL" : "LIVE (read-only)";
const sb = createClient<Database>(url, key, { auth: { persistSession: false } });
const OUT = "_docs/task/455-kickoff-rebaseline/out";

// Source of truth: "Tracker vs. Hub_Status tracker as of Oct. 15.csv" (PM-checked kickoff dates).
// Keyed by the display project_id (unique); the UUID is resolved and printed in the plan.
type Mapping = { tracker: string; account: string; projectId: string; kickoff: string };
const MAPPINGS: Mapping[] = [
  { tracker: "01", account: "Retail Sign Systems", projectId: "DDF84B09-PROJ-02", kickoff: "2026-06-23" },
  { tracker: "03", account: "Saginaw CFC", projectId: "C30DE6A5-PROJ-03", kickoff: "2026-07-23" },
  { tracker: "05", account: "WMI Home Solutions", projectId: "09A80681-PROJ-02", kickoff: "2026-08-17" },
  { tracker: "06", account: "Veteran Roofing & Exteriors", projectId: "C74DEA31-PROJ-02", kickoff: "2026-06-22" },
  { tracker: "07", account: "Black Barn Dumpsters", projectId: "2CDA5C64-PROJ-02", kickoff: "2026-08-14" },
  { tracker: "08", account: "Greydog Security (Website — D1)", projectId: "82ACEB0F-PROJ-02", kickoff: "2026-06-29" },
  { tracker: "09", account: "Studio Belmont", projectId: "8978E416-PROJ-02", kickoff: "2026-07-23" },
  { tracker: "10", account: "RCB & Associates LLC", projectId: "5EBACF20-PROJ-01", kickoff: "2026-07-08" },
  { tracker: "12", account: "M&I Interiors", projectId: "D0A5D523-PROJ-04", kickoff: "2026-07-14" },
  { tracker: "13", account: "Royal Thumper", projectId: "FC6D83AB-PROJ-01", kickoff: "2026-08-06" },
  { tracker: "14", account: "Hello Homes GR", projectId: "D45CA759-PROJ-01", kickoff: "2026-07-28" },
  { tracker: "15", account: "AB Lekdetectie", projectId: "82159826-PROJ-01", kickoff: "2026-09-30" },
  { tracker: "16", account: "Maxton Manufacturing", projectId: "BD64C367-PROJ-01", kickoff: "2026-10-08" },
];

// Not plannable by this script — listed in plan.md for the operator.
const STATIC_OPERATOR_ACTIONS = [
  "**#17 Grand River Realty (kickoff 2026-10-12)** — no customer exists in the Hub. Create it via New Project intake (StackShift I), start the programme, then add its `project_id` to `MAPPINGS` and re-run.",
  "**#08 Greydog Security — `82ACEB0F-PROJ-03` (StackShift I Upgrade)** — a second live programme for the same account. Decision D1 re-baselines only the Website project (`82ACEB0F-PROJ-02`); PROJ-03 is NOT touched. The PM should decide whether to close it.",
];

const lit = (v: string | null) => (v === null ? "null" : `'${v.replace(/'/g, "''")}'`);
const ymd = (iso: string) => iso.slice(0, 10);

type Planned = {
  m: Mapping;
  uuid: string;
  name: string;
  fromStartedAt: string;
  toStartedAt: string;
  totalDays: number;
  phasePatches: (DatePatch & { from: { start_date: string | null; due_date: string | null } })[];
  deliverablePatches: (DatePatch & { from: { start_date: string | null; due_date: string | null } })[];
};

async function main() {
  console.log(`Target: ${target}\n`);
  const planned: Planned[] = [];
  const unchanged: string[] = [];
  const operator: string[] = [...STATIC_OPERATOR_ACTIONS];

  for (const m of MAPPINGS) {
    const { data: project, error } = await sb
      .from("projects")
      .select("id, name, status, programme_started_at")
      .eq("project_id", m.projectId)
      .maybeSingle();
    if (error) throw new Error(`${m.projectId}: ${error.message}`);
    if (!project) { operator.push(`**#${m.tracker} ${m.account}** — \`${m.projectId}\` not found. Check the mapping.`); continue; }
    if (project.status === "deleted") { operator.push(`**#${m.tracker} ${m.account}** — \`${m.projectId}\` is soft-deleted. Skipped.`); continue; }
    if (!project.programme_started_at) {
      operator.push(`**#${m.tracker} ${m.account} (kickoff ${m.kickoff})** — \`${m.projectId}\` has no started programme. Set its StackShift I classification and start the programme from the project page, then re-run this dry run.`);
      continue;
    }
    if (ymd(project.programme_started_at) === m.kickoff) {
      unchanged.push(`#${m.tracker} ${m.account} (\`${m.projectId}\`) — already starts ${m.kickoff}.`);
      continue;
    }

    const { data: phases, error: pErr } = await sb
      .from("project_phases")
      .select("id, status, day_start, day_end, start_date, due_date")
      .eq("project_id", project.id)
      .eq("source", "programme");
    if (pErr) throw new Error(`${m.projectId} phases: ${pErr.message}`);
    const { data: deliverables, error: dErr } = await sb
      .from("project_deliverables")
      .select("id, phase_id, day_start, day_end, start_date, due_date")
      .eq("project_id", project.id)
      .eq("source", "programme");
    if (dErr) throw new Error(`${m.projectId} deliverables: ${dErr.message}`);

    const toStartedAt = kickoffTimestamp(m.kickoff);
    const patches = materialiseDates({ programmeStartedAt: toStartedAt, phases: phases ?? [], deliverables: deliverables ?? [] });
    const phaseById = new Map((phases ?? []).map((p) => [p.id, p]));
    const delivById = new Map((deliverables ?? []).map((d) => [d.id, d]));
    planned.push({
      m,
      uuid: project.id,
      name: project.name ?? m.account,
      fromStartedAt: project.programme_started_at,
      toStartedAt,
      totalDays: Math.max(0, ...(phases ?? []).map((p) => p.day_end ?? 0)) || 120,
      phasePatches: patches.phases.map((p) => ({ ...p, from: { start_date: phaseById.get(p.id)!.start_date, due_date: phaseById.get(p.id)!.due_date } })),
      deliverablePatches: patches.deliverables.map((p) => ({ ...p, from: { start_date: delivById.get(p.id)!.start_date, due_date: delivById.get(p.id)!.due_date } })),
    });
  }

  // ── plan.md ──
  const day = (iso: string, total: number) => currentDisplayDay(iso, total);
  const md: string[] = [
    `# Task 455 — kickoff re-baseline plan`,
    ``,
    `Generated ${new Date().toISOString()} against ${target}. Nothing has been applied.`,
    ``,
    `## Re-baseline (${planned.length})`,
    ``,
    `| # | Account | project_id | Current start | New kickoff | Day now → after | Days left now → after | Phase / deliverable date rows |`,
    `|---|---|---|---|---|---|---|---|`,
    ...planned.map((p) => {
      const before = day(p.fromStartedAt, p.totalDays);
      const after = day(p.toStartedAt, p.totalDays);
      return `| ${p.m.tracker} | ${p.m.account} | \`${p.m.projectId}\` | ${ymd(p.fromStartedAt)} | ${p.m.kickoff} | ${before} → ${after} | ${Math.max(0, p.totalDays - before)} → ${Math.max(0, p.totalDays - after)} | ${p.phasePatches.length} / ${p.deliverablePatches.length} |`;
    }),
    ``,
    `## Already matching (${unchanged.length})`,
    ``,
    ...unchanged.map((u) => `- ${u}`),
    ``,
    `## Operator actions (${operator.length})`,
    ``,
    ...operator.map((o) => `- ${o}`),
    ``,
    `## Not changed by this plan`,
    ``,
    `Phase status, actual start/completed dates and skip flags are untouched, so per-phase "overdue" figures in the Status Report do not change. Only Day N, days left and the phase/deliverable start/due dates move.`,
    ``,
  ];

  // ── apply.sql / rollback.sql ──
  const apply: string[] = [
    `-- Task 455 — kickoff re-baseline. REVIEW out/plan.md first. Run once in the Supabase SQL editor.`,
    `-- Each project block aborts the whole transaction if its programme_started_at changed since the dry run.`,
    `begin;`,
  ];
  const rollback: string[] = [`-- Task 455 — rollback of apply.sql (restores the values read by the dry run).`, `begin;`];
  for (const p of planned) {
    apply.push(``, `-- #${p.m.tracker} ${p.m.account} (${p.m.projectId}, ${p.uuid})`);
    apply.push(
      `do $$ begin if (select programme_started_at from projects where id = ${lit(p.uuid)}) is distinct from ${lit(p.fromStartedAt)}::timestamptz then raise exception 'task 455: ${p.m.projectId} programme_started_at changed since the dry run — re-run it'; end if; end $$;`
    );
    apply.push(`update projects set programme_started_at = ${lit(p.toStartedAt)} where id = ${lit(p.uuid)};`);
    rollback.push(``, `-- #${p.m.tracker} ${p.m.account} (${p.m.projectId})`);
    rollback.push(`update projects set programme_started_at = ${lit(p.fromStartedAt)} where id = ${lit(p.uuid)};`);
    for (const [table, rows] of [["project_phases", p.phasePatches], ["project_deliverables", p.deliverablePatches]] as const) {
      for (const r of rows) {
        apply.push(`update ${table} set start_date = ${lit(r.start_date)}, due_date = ${lit(r.due_date)} where id = ${lit(r.id)};`);
        rollback.push(`update ${table} set start_date = ${lit(r.from.start_date)}, due_date = ${lit(r.from.due_date)} where id = ${lit(r.id)};`);
      }
    }
  }
  apply.push(``, `commit;`, ``);
  rollback.push(``, `commit;`, ``);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/plan.md`, md.join("\n"));
  writeFileSync(`${OUT}/apply.sql`, apply.join("\n"));
  writeFileSync(`${OUT}/rollback.sql`, rollback.join("\n"));

  console.log(md.join("\n"));
  console.log(`\nWrote ${OUT}/plan.md, apply.sql, rollback.sql — NOT applied.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
