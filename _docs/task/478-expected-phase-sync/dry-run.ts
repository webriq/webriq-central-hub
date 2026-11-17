// Task 478 — READ-ONLY dry run: move StackShift I programmes to the PM tracker's *Expected* phase (Nov 17).
// Earlier phases → completed (calendar-dated), target → active, later → planned. Never writes to the database;
// writes out/plan.md, out/apply.sql and out/rollback.sql for REVIEW. out/ is git-ignored (real data).
//
//   npx tsx --env-file=.env --tsconfig tsconfig.json _docs/task/478-expected-phase-sync/dry-run.ts           (batch 1 → out/)
//   npx tsx --env-file=.env --tsconfig tsconfig.json _docs/task/478-expected-phase-sync/dry-run.ts --ended   (batch 2 → out/ended/)
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import type { Database } from "@/types/database";
import { dayOf, expectedPhaseFor, planExpectedPhase, type PhaseRow, type PhaseSyncPlan } from "./plan";

const url = process.env.BACKFILL_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.BACKFILL_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY!;
const target = /127\.0\.0\.1|localhost/.test(url) ? "LOCAL" : "LIVE (read-only)";
const sb = createClient<Database>(url, key, { auth: { persistSession: false } });
// Batch 2 (--ended): programmes past Day 120 whose tracker Expected reads "Programme ended <date>" go to
// Optimize "for now" (user decision, 2026-11-17). Separate output folder so batch 1's rollback.sql survives.
const ENDED = process.argv.includes("--ended");
const OUT = ENDED ? "_docs/task/478-expected-phase-sync/out/ended" : "_docs/task/478-expected-phase-sync/out";
const PHASE_NAMES = ["", "Onboard", "Migrate & Rebrand", "Publish", "AI Visibility", "Optimize"];

// Local calendar date (the Hub's day numbers are local-midnight based).
const now = new Date();
const TODAY = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

// Tracker "Status tracker as of Nov 17", column "Phase: Now ▸ Expected". Programmes past Day 120 are
// excluded (user decision: they keep the tracker's "Now" phase, which already matches the Hub).
type Move = { tracker: string; account: string; projectId: string; expected: number; note?: string };
const MOVES_ENDED: Move[] = [
  { tracker: "02", account: "Trident Roof Solutions Website", projectId: "67CC38C5-PROJ-04", expected: 5, note: "Programme ended Oct 14; stays On Hold" },
  { tracker: "06", account: "Veteran Roofing & Exteriors", projectId: "C74DEA31-PROJ-02", expected: 5, note: "Programme ended Oct 19" },
  { tracker: "01", account: "Retail Sign Systems", projectId: "DDF84B09-PROJ-02", expected: 5, note: "Programme ended Oct 20" },
  { tracker: "08", account: "Greydog Security", projectId: "82ACEB0F-PROJ-03", expected: 5, note: "Programme ended Oct 26" },
  { tracker: "10", account: "RCB & Associates LLC", projectId: "5EBACF20-PROJ-01", expected: 5, note: "Programme ended Nov 4" },
  { tracker: "12", account: "M&I Interiors", projectId: "D0A5D523-PROJ-04", expected: 5, note: "Programme ended Nov 10" },
];
const MOVES_BATCH1: Move[] = [
  { tracker: "03", account: "Saginaw CFC", projectId: "C30DE6A5-PROJ-03", expected: 5 },
  { tracker: "09", account: "Studio Belmont", projectId: "8978E416-PROJ-02", expected: 5 },
  { tracker: "14", account: "Hello Homes GR", projectId: "D45CA759-PROJ-01", expected: 5 },
  { tracker: "13", account: "Royal Thumper", projectId: "FC6D83AB-PROJ-01", expected: 5 },
  { tracker: "07", account: "Black Barn Dumpsters", projectId: "2CDA5C64-PROJ-02", expected: 5 },
  { tracker: "05", account: "WMI Home Solutions", projectId: "09A80681-PROJ-02", expected: 5 },
  { tracker: "18", account: "Glorias Anzac Biscuits", projectId: "3028EE9B-PROJ-02", expected: 4, note: "tracker Expected is TBC; Hub Day 80 → AI Visibility (user decision)" },
  { tracker: "15", account: "AB Lekdetectie", projectId: "82159826-PROJ-01", expected: 3 },
  { tracker: "16", account: "Maxton", projectId: "BD64C367-PROJ-02", expected: 3 },
];
const MOVES = ENDED ? MOVES_ENDED : MOVES_BATCH1;

const NOT_MOVED = ENDED ? [
  "Programmes still within Day 120 — handled by batch 1 (out/).",
  "Trident Roof Solutions App (`67CC38C5-PROJ-03`): Discrete Development — out of scope.",
] : [
  "Past Day 120 — keep the tracker's \"Now\" phase (already matching): Trident Roof Solutions Website (On Hold, M&R), Veteran Roofing, Retail Sign Systems, Greydog Security (Publish), RCB & Associates, M&I Interiors (M&R).",
  "Trident Roof Solutions App (`67CC38C5-PROJ-03`): Discrete Development — out of scope.",
  "Shelly Beach House (`EAFB5494-PROJ-01`): now classified StackShift Access, not on the StackShift I list.",
];

const lit = (v: string | boolean | null | undefined) =>
  v === null || v === undefined ? "null" : typeof v === "boolean" ? String(v) : `'${v.replace(/'/g, "''")}'`;
const setSql = (f: Record<string, unknown>) => Object.entries(f).map(([k, v]) => `${k} = ${lit(v as string | null)}`).join(", ");
// Byte-order sort to match the guard's `order by id::text collate "C"`.
const snapshot = (rows: { id: string; status: string; actual_start_date: string | null; actual_completed_date: string | null }[]) =>
  [...rows].sort((a, b) => (a.id < b.id ? -1 : 1)).map((r) => `${r.id}:${r.status}:${r.actual_start_date ?? ""}:${r.actual_completed_date ?? ""}`).join(",");

async function main() {
  console.log(`Target: ${target} · today ${TODAY}\n`);
  type Planned = { m: Move; uuid: string; day: number; snap: string; plan: PhaseSyncPlan; prevState: Map<string, { is_manual_override: boolean; override_note: string | null }> };
  const planned: Planned[] = [];
  const noop: string[] = [];
  const problems: string[] = [];

  for (const m of MOVES) {
    const { data: project, error } = await sb.from("projects").select("id, status, programme_started_at, programme_duration_days").eq("project_id", m.projectId).maybeSingle();
    if (error) throw new Error(`${m.projectId}: ${error.message}`);
    if (!project || project.status === "deleted" || project.status === "archived" || !project.programme_started_at) {
      problems.push(`#${m.tracker} ${m.account}: \`${m.projectId}\` not found, ${project?.status}, or not started. Skipped.`);
      continue;
    }
    if ((project.programme_duration_days ?? 120) !== 120) { problems.push(`#${m.tracker} ${m.account}: programme is ${project.programme_duration_days} days, not 120. Skipped.`); continue; }

    // Kickoff stored at 12:00 UTC on the PM-confirmed date — its UTC date is the kickoff date.
    const kickoffYmd = project.programme_started_at.slice(0, 10);
    const day = dayOf(kickoffYmd, TODAY);
    // Past Day 120 the calendar has no phase; batch 2 parks those on Optimize (the last phase).
    const calendarPhase = day <= 120 ? expectedPhaseFor(day) : ENDED ? 5 : null;
    if (ENDED && day <= 120) { problems.push(`#${m.tracker} ${m.account}: Day ${day} is within the programme — belongs in batch 1. Skipped.`); continue; }
    if (calendarPhase !== m.expected) {
      problems.push(`#${m.tracker} ${m.account}: tracker Expected is P${m.expected}, but Day ${day} from kickoff ${kickoffYmd} is P${calendarPhase ?? "past 120"}. Skipped — re-check the tracker.`);
      continue;
    }

    const { data: rows, error: pErr } = await sb
      .from("project_phases")
      .select("id, phase_number, position, status, actual_start_date, actual_completed_date")
      .eq("project_id", project.id)
      .eq("source", "programme");
    if (pErr) throw new Error(`${m.projectId} phases: ${pErr.message}`);

    let plan: PhaseSyncPlan;
    try { plan = planExpectedPhase((rows ?? []) as PhaseRow[], { kickoffYmd, targetPhase: m.expected, todayYmd: TODAY }); }
    catch (e) { problems.push(`#${m.tracker} ${m.account}: ${(e as Error).message}. Skipped.`); continue; }
    if (plan.updates.length === 0) { noop.push(`#${m.tracker} ${m.account} (\`${m.projectId}\`): already on ${PHASE_NAMES[m.expected]} with completed history.`); continue; }

    const ids = plan.state.map((s) => s.phase_id);
    const { data: st, error: sErr } = ids.length
      ? await sb.from("phase_programme_state").select("phase_id, is_manual_override, override_note").in("phase_id", ids)
      : { data: [], error: null };
    if (sErr) throw new Error(`${m.projectId} state: ${sErr.message}`);
    planned.push({ m, uuid: project.id, day, snap: snapshot(rows ?? []), plan, prevState: new Map((st ?? []).map((s) => [s.phase_id, s])) });
  }

  const md: string[] = [
    `# Task 478: expected-phase sync plan${ENDED ? " (batch 2: programme ended → Optimize)" : ""}`, ``, `Generated ${new Date().toISOString()} against ${target} (today ${TODAY}). Nothing has been applied.`, ``,
    `## Projects to move (${planned.length})`, ``,
    `| # | Account | project_id | Day | Move to |`, `|---|---|---|---|---|`,
    ...planned.map((p) => `| ${p.m.tracker} | ${p.m.account} | \`${p.m.projectId}\` | ${p.day} | P${p.m.expected} ${PHASE_NAMES[p.m.expected]}${p.m.note ? ` (${p.m.note})` : ""} |`),
    ``, `## Field changes`, ``,
    `| Account | Phase | Field | Now | After |`, `|---|---|---|---|---|`,
    ...planned.flatMap((p) => p.plan.updates.flatMap((u) => Object.keys(u.set).map((k) =>
      `| ${p.m.account} | P${u.phase_number} ${PHASE_NAMES[u.phase_number ?? 0] ?? ""} | ${k} | ${(u.from as Record<string, unknown>)[k] ?? "null"} | ${(u.set as Record<string, unknown>)[k] ?? "null"} |`))),
    ``, `## Already matching (${noop.length})`, ``, ...noop.map((n) => `- ${n}`),
    ``, `## Skipped / problems (${problems.length})`, ``, ...problems.map((n) => `- ${n}`),
    ``, `## Not moved by this plan`, ``, ...NOT_MOVED.map((n) => `- ${n}`),
    ``, `## Not changed`, ``,
    `Kickoffs, deliverables, delay/project notes and projects.status. No Cliq notifications are sent.`, ``,
  ];

  const apply = [`-- Task 478${ENDED ? " batch 2 (ended → Optimize)" : ""}: expected-phase sync. REVIEW plan.md in this folder first. Run once in the Supabase SQL editor.`, `-- Each project block aborts the whole transaction if its phases changed since the dry run.`, `begin;`];
  const rollback = [`-- Task 478${ENDED ? " batch 2" : ""}: rollback of apply.sql (restores the values read by the dry run).`, `begin;`];
  for (const p of planned) {
    apply.push(``, `-- #${p.m.tracker} ${p.m.account} (${p.m.projectId}, ${p.uuid}) → P${p.m.expected} ${PHASE_NAMES[p.m.expected]}`);
    apply.push(`do $$ begin if (select string_agg(id::text || ':' || status || ':' || coalesce(actual_start_date::text, '') || ':' || coalesce(actual_completed_date::text, ''), ',' order by id::text collate "C") from project_phases where project_id = ${lit(p.uuid)} and source = 'programme') is distinct from ${lit(p.snap)} then raise exception 'task 478: ${p.m.projectId} phases changed since the dry run, re-run it'; end if; end $$;`);
    rollback.push(``, `-- #${p.m.tracker} ${p.m.account} (${p.m.projectId})`);
    // Demotions first, target last (one-active unique index); rollback reverses so the target is demoted before the old active returns.
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
