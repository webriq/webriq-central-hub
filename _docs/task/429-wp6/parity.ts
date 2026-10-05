// Task 429 WP6 — golden parity check. READ-ONLY. For every project with programme rows, compares what the OLD pipeline computed from
// `customer_phases`/`customer_deliverables` (resolveEffectivePhase + ProgrammeCalendar compress/scale — exactly what the old Timeline
// rendered) with what the NEW path returns (store.loadProgramme + view-model.buildDisplayPhases from the unified tables).
// Run it AFTER the backfill SQL has been applied and BEFORE freezing the legacy tables. Any unexpected diff blocks the deploy.
//   NODE_OPTIONS=--experimental-websocket node --env-file=.env node_modules/tsx/dist/cli.mjs _docs/task/429-wp6/parity.ts
// Local target: PARITY_SUPABASE_URL=http://127.0.0.1:54321 PARITY_SECRET_KEY=<local service key> ...
// Known, intentional differences (reported separately, do not fail the run): task 432 (permanent skip + stored overrides) — the old
// pipeline compressed overrides twice; the new one stores what is drawn.
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import type { Database } from "@/types/database";
import { resolveEffectivePhase } from "@/config/customer-phases";
import { createProgrammeCalendar, referenceSpansOf } from "@/lib/programme/calendar";
import { loadProgramme } from "@/lib/programme/store";
import { buildDisplayPhases, toWire, uiPhaseStatus } from "@/lib/programme/view-model";
import { activePhase, isProgrammeComplete } from "@/lib/programme/programme-status";

const url = process.env.PARITY_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.PARITY_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY!;
const target = /127\.0\.0\.1|localhost/.test(url) ? "LOCAL" : "LIVE (read-only)";
const sb = createClient<Database>(url, key, { auth: { persistSession: false } });

async function all<T>(table: string, cols: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table as never).select(cols).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as T[]));
    if ((data as unknown[]).length < 1000) break;
  }
  return rows;
}

type CP = { project_id: string; phase_number: number; status: string; sort_order: number; custom_name: string | null; day_start_override: number | null; day_end_override: number | null; actual_start_date: string | null; actual_completed_date: string | null; is_manual_override: boolean; override_note: string | null; delay_note: string | null; wizard_data: unknown };
type CD = { project_id: string; phase_number: number; deliverable_key: string; status: string; custom_name: string | null; custom_description: string | null; custom_owner: string | null; day_start_override: number | null; day_end_override: number | null };
type PR = { id: string; programme_duration_days: number | null; draft_skip_phase_numbers: number[] | null };

const group = <T extends { project_id: string }>(rows: T[]) => rows.reduce((m, r) => m.set(r.project_id, [...(m.get(r.project_id) ?? []), r]), new Map<string, T[]>());
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
// old status vocabulary → acceptable new statuses (a time-bypassed phase used to read "skipped")
const OLD_TO_NEW: Record<string, string[]> = { not_started: ["planned"], active: ["active"], completed: ["completed"], skipped: ["skipped", "bypassed"] };

async function main() {
  console.log(`Target: ${target}\n`);
  const [cp, cd, projects] = await Promise.all([
    all<CP>("customer_phases", "project_id,phase_number,status,sort_order,custom_name,day_start_override,day_end_override,actual_start_date,actual_completed_date,is_manual_override,override_note,delay_note,wizard_data"),
    all<CD>("customer_deliverables", "project_id,phase_number,deliverable_key,status,custom_name,custom_description,custom_owner,day_start_override,day_end_override"),
    all<PR>("projects", "id,programme_duration_days,draft_skip_phase_numbers"),
  ]);
  const cpBy = group(cp), cdBy = group(cd), prMap = new Map(projects.map((p) => [p.id, p]));
  const diffs: { project: string; what: string; old: unknown; new: unknown }[] = [];
  const knownDiffs: string[] = [];
  // A phase with ZERO deliverable rows made the old UI fall back to the static default deliverables (phantom, uninteractive cards, only
  // ever on jumped-past phases). The new model has no phantom rows, so those comparisons are skipped and reported.
  const staticFallbackPhases: string[] = [];
  let projectsChecked = 0, fieldsChecked = 0;

  for (const [projectId, phaseRows] of cpBy) {
    const project = prMap.get(projectId);
    if (!project) continue; // deleted project: legacy rows only, nothing to render
    projectsChecked++;
    const diff = (what: string, o: unknown, n: unknown) => { fieldsChecked++; if (!same(o, n)) diffs.push({ project: projectId, what, old: o, new: n }); };

    // ── OLD pipeline (what the previous Timeline rendered) ──
    const delivByPhase = group(((cdBy.get(projectId) ?? []) as CD[]).map((d) => ({ ...d, project_id: String(d.phase_number) })));
    const sorted = [...phaseRows].sort((a, b) => a.sort_order - b.sort_order);
    const ordered = sorted.map((p) => resolveEffectivePhase(p, (delivByPhase.get(String(p.phase_number)) ?? []) as never));
    const skip = project.draft_skip_phase_numbers ?? [];
    const calendar = createProgrammeCalendar({ durationDays: project.programme_duration_days ?? undefined, skipPhaseNumbers: skip, phases: referenceSpansOf(ordered) });
    const oldDisplay = calendar.toDisplayPhases(calendar.compressPhases(ordered));
    const hasOverride = ordered.some((p) => p.dayStartOverridden || p.dayEndOverridden || p.deliverables.some((d) => d.dayStartOverridden || d.dayEndOverridden));
    const task432 = skip.length > 0 && hasOverride;
    if (task432) knownDiffs.push(projectId);

    // ── NEW path ──
    const programme = await loadProgramme(sb as never, projectId);
    const wire = toWire(programme);
    const newDisplay = buildDisplayPhases(wire.phases, wire.deliverables);

    diff("phase numbers (programme order)", oldDisplay.map((p) => p.number), newDisplay.map((p) => p.number));
    diff("active phase", sorted.find((p) => p.status === "active")?.phase_number ?? null, activePhase(wire.phases)?.phase_number ?? null);
    diff("programme complete", sorted.length > 0 && sorted[sorted.length - 1].status === "completed", isProgrammeComplete(wire.phases));
    for (const o of sorted) {
      const n = wire.phases.find((p) => p.phase_number === o.phase_number);
      fieldsChecked++;
      if (!n) { diffs.push({ project: projectId, what: `P${o.phase_number} missing`, old: o.status, new: null }); continue; }
      if (!OLD_TO_NEW[o.status]?.includes(n.status)) diffs.push({ project: projectId, what: `P${o.phase_number} status`, old: o.status, new: n.status });
      diff(`P${o.phase_number} actual_start_date`, o.actual_start_date, n.actual_start_date);
      diff(`P${o.phase_number} actual_completed_date`, o.actual_completed_date, n.actual_completed_date);
      diff(`P${o.phase_number} wizard_data`, o.wizard_data ?? {}, n.wizard_data ?? {});
      diff(`P${o.phase_number} delay_note`, o.delay_note, n.delay_note);
      diff(`P${o.phase_number} override flag/note`, [o.is_manual_override, o.override_note], [n.is_manual_override, n.override_note]);
    }
    for (const op of oldDisplay) {
      if (skip.includes(op.number)) continue; // permanently skipped: never drawn
      const np = newDisplay.find((p) => p.number === op.number);
      diff(`P${op.number} name`, op.name, np?.name);
      if (!task432) {
        diff(`P${op.number} window`, [op.dayStart, op.dayEnd], [np?.dayStart, np?.dayEnd]);
        const hasOldRows = (cdBy.get(projectId) ?? []).some((d) => d.phase_number === op.number);
        if (!hasOldRows) staticFallbackPhases.push(`${projectId}#P${op.number}`);
        for (const od of hasOldRows ? op.deliverables : []) {
          const nd = np?.deliverables.find((d) => d.key === od.key);
          diff(`P${op.number}/${od.key} window`, [od.dayStart, od.dayEnd], [nd?.dayStart, nd?.dayEnd]);
          diff(`P${op.number}/${od.key} name/owner`, [od.name, od.owner], [nd?.name, nd?.owner]);
        }
      }
      if ((cdBy.get(projectId) ?? []).some((d) => d.phase_number === op.number)) {
        diff(`P${op.number} deliverable keys`, op.deliverables.map((d) => d.key).sort(), (np?.deliverables ?? []).map((d) => d.key).sort());
      }
    }
    for (const od of (cdBy.get(projectId) ?? [])) {
      const nd = wire.deliverables.find((d) => d.phase_number === od.phase_number && d.deliverable_key === od.deliverable_key);
      diff(`P${od.phase_number}/${od.deliverable_key} status`, od.status, nd?.status);
    }
  }

  mkdirSync("_docs/task/429-wp6/out", { recursive: true });
  writeFileSync("_docs/task/429-wp6/out/parity.json", JSON.stringify({ target, generatedAt: new Date().toISOString(), projectsChecked, fieldsChecked, knownDiffs, staticFallbackPhases, diffs }, null, 1));
  console.log(`Projects compared: ${projectsChecked} | fields compared: ${fieldsChecked} | unexpected diffs: ${diffs.length}`);
  if (knownDiffs.length) console.log(`Task-432 projects (skip + stored overrides; window comparison skipped, structure/status still compared): ${knownDiffs.length}`);
  if (staticFallbackPhases.length) console.log(`Phases with no deliverable rows (old UI showed static phantom cards; compared structurally only): ${staticFallbackPhases.length}`);
  const byWhat = new Map<string, number>();
  for (const d of diffs) byWhat.set(d.what.replace(/^P\d+(\/[^ ]+)?/, "P*"), (byWhat.get(d.what.replace(/^P\d+(\/[^ ]+)?/, "P*")) ?? 0) + 1);
  for (const [k, v] of [...byWhat].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(v).padStart(5)}  ${k}`);
  for (const d of diffs.slice(0, 10)) console.log(`  e.g. ${d.project} ${d.what}: old=${JSON.stringify(d.old)} new=${JSON.stringify(d.new)}`);
  console.log(diffs.length ? "\nPARITY FAILED — see out/parity.json. Do not deploy." : "\nPARITY OK.");
  process.exitCode = diffs.length ? 1 : 0;
}
main().then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(e); process.exit(2); });
