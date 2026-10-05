// Task 425 acceptance check — READ-ONLY. Compares the pre-refactor inline pipeline (copied verbatim
// from _onboarding-detail.tsx / _use-programme-progress.ts before task 425) against ProgrammeCalendar for
// every programme project in the database, with the project's real skip list AND synthetic skip sets.
//   NODE_OPTIONS=--experimental-websocket node --env-file=.env node_modules/tsx/dist/cli.mjs _docs/task/425-checks/legacy-vs-calendar.ts
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { compressReferenceDay, resolveEffectivePhase, scaleDay, unscaleDay, getPhaseForDay, getCurrentProgrammeDay } from "@/config/customer-phases";
import { createProgrammeCalendar, currentDisplayDay, phaseAtDisplayDay, asDisplayDay, referenceSpansOf } from "@/lib/programme/calendar";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
async function all(table: string, cols: string) {
  const rows: Record<string, any>[] = [];
  for (let f = 0; ; f += 1000) { const { data, error } = await sb.from(table).select(cols).range(f, f + 999); if (error) throw error; rows.push(...(data as any[])); if (data.length < 1000) break; }
  return rows;
}
function legacy(orderedPhases: any[], skip: number[], duration: number) {
  const compressedPhases = orderedPhases.map((p) => skip.includes(p.number) ? p : {
    ...p,
    dayStart: compressReferenceDay(p.dayStart, orderedPhases, skip), dayEnd: compressReferenceDay(p.dayEnd, orderedPhases, skip),
    deliverables: p.deliverables.map((d: any) => ({ ...d, dayStart: compressReferenceDay(d.dayStart, orderedPhases, skip), dayEnd: compressReferenceDay(d.dayEnd, orderedPhases, skip) })),
  });
  const visibleTotalDays = compressReferenceDay(120, orderedPhases, skip);
  const visibleDurationDays = scaleDay(visibleTotalDays, duration);
  const displayPhases = compressedPhases.map((p: any) => ({
    ...p, dayStart: scaleDay(p.dayStart, duration), dayEnd: scaleDay(p.dayEnd, duration),
    deliverables: p.deliverables.map((d: any) => ({ ...d, dayStart: scaleDay(d.dayStart, duration), dayEnd: scaleDay(d.dayEnd, duration) })),
  }));
  return { compressedPhases, visibleDurationDays, displayPhases };
}

async function main() {
const cp = await all("customer_phases", "project_id,phase_number,custom_name,day_start_override,day_end_override,sort_order");
const cd = await all("customer_deliverables", "project_id,phase_number,deliverable_key,custom_name,custom_description,custom_owner,day_start_override,day_end_override");
const pr = await all("projects", "id,programme_duration_days,draft_skip_phase_numbers,programme_started_at");

type Row = Record<string, any>;
function byProject(rows: Row[]): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const list = m.get(r.project_id) ?? [];
    list.push(r);
    m.set(r.project_id, list);
  }
  return m;
}
const cpBy = byProject(cp), cdBy = byProject(cd);
const prMap = new Map<string, Row>(pr.map((p): [string, Row] => [p.id, p]));
let projects = 0, comparisons = 0, deliverablesCompared = 0;
  const overrideSkipProjects = new Set<string>();
for (const [projectId, phaseRows] of cpBy) {
  const project = prMap.get(projectId); if (!project) continue;
  const duration = project.programme_duration_days ?? 120;
  const sorted = [...phaseRows].sort((a, b) => a.sort_order - b.sort_order);
  const delivByPhase = new Map<number, Row[]>();
  for (const d of cdBy.get(projectId) ?? []) {
    const list = delivByPhase.get(d.phase_number) ?? [];
    list.push(d);
    delivByPhase.set(d.phase_number, list);
  }
  const ordered = sorted.map((p) => resolveEffectivePhase(p as any, (delivByPhase.get(p.phase_number) ?? []) as any));
  // Task 432: stored overrides are read as already-compressed, so the *pre-refactor* pipeline (which
  // compressed them a second time) intentionally differs wherever a permanent skip meets an override.
  // Compare legacy ↔ calendar only where compression is the identity (no skip) or nothing is overridden;
  // for the remaining combinations assert the new rule's invariant (every card inside its phase window).
  const hasOverride = ordered.some((p: any) => p.dayStartOverridden || p.dayEndOverridden || p.deliverables.some((d: any) => d.dayStartOverridden || d.dayEndOverridden));
  const skipSets = [project.draft_skip_phase_numbers ?? [], [], ...(hasOverride ? [] : [[1], [1, 2], [2], [3]])];
  for (const skip of skipSets) for (const dur of [duration, 120, 60, 90]) {
    const old = legacy(ordered, skip, dur);
    const cal = createProgrammeCalendar({ durationDays: dur, skipPhaseNumbers: skip, phases: referenceSpansOf(ordered) });
    if (skip.length > 0 && hasOverride) {
      const disp = cal.toDisplayPhases(cal.compressPhases(ordered));
      for (const ph of disp) { if (skip.includes(ph.number)) continue; for (const d of ph.deliverables) assert.ok(d.dayStart >= ph.dayStart && d.dayEnd <= ph.dayEnd, `${projectId} P${ph.number} ${d.key} D${d.dayStart}-${d.dayEnd} outside D${ph.dayStart}-${ph.dayEnd}`); }
      overrideSkipProjects.add(projectId);
      comparisons++;
      continue;
    }
    const compressed = cal.compressPhases(ordered);
    assert.deepEqual(compressed, old.compressedPhases, `compressed ${projectId} skip=${skip} dur=${dur}`);
    assert.equal(cal.totalDays.display, old.visibleDurationDays, `visibleDuration ${projectId}`);
    assert.deepEqual(cal.toDisplayPhases(compressed), old.displayPhases, `display ${projectId}`);
    // write path: display → stored scale is unscaleDay
    for (const p of old.displayPhases) for (const d of p.deliverables) { assert.equal(cal.displayToCompressed(asDisplayDay(d.dayStart)), unscaleDay(d.dayStart, dur)); deliverablesCompared++; }
    comparisons++;
  }
  // today / active-phase helpers
  if (project.programme_started_at) {
    assert.equal(currentDisplayDay(project.programme_started_at), getCurrentProgrammeDay(project.programme_started_at));
    assert.equal(currentDisplayDay(project.programme_started_at, duration), Math.min(duration, getCurrentProgrammeDay(project.programme_started_at)));
    const day = getCurrentProgrammeDay(project.programme_started_at);
    assert.equal(phaseAtDisplayDay(day, duration).number, getPhaseForDay(unscaleDay(day, duration)).number);
  }
  projects++;
}
console.log(`OK — ${projects} programme projects, ${comparisons} (skip-set × duration) comparisons, ${deliverablesCompared} write-path conversions. Identical to the pre-refactor pipeline everywhere compression is the identity or nothing is overridden; ${overrideSkipProjects.size} project(s) with a permanent skip + stored overrides intentionally differ (task 432) and satisfy "every card inside its phase window".`);

}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
