// Task 475 — pure planner for aligning a programme's active phase / phase statuses to the PM tracker.
// Mirrors the already-started cascade of PATCH /api/projects/[projectId]/programme/phase, except the
// target keeps its existing actual_start_date (fallback: its derived start_date) instead of "today".
import { inProgrammeOrder, isPermanentlySkipped, type PhaseStatus } from "../../../src/lib/programme/programme-status";

export type PhaseRow = {
  id: string;
  phase_number: number | null;
  position: number | null;
  status: PhaseStatus;
  start_date: string | null;
  actual_start_date: string | null;
  actual_completed_date: string | null;
};

type Fields = Partial<Pick<PhaseRow, "status" | "actual_start_date" | "actual_completed_date">>;
export type PhaseUpdate = { id: string; phase_number: number | null; set: Fields; from: Fields };
export type StateUpsert = { phase_id: string; is_manual_override: boolean; override_note: string | null };
export type PhaseSyncPlan = { updates: PhaseUpdate[]; state: StateUpsert[] };

export const OVERRIDE_NOTE = "Task 475: aligned to PM tracker (Oct 15)";

function diff(row: PhaseRow, want: Fields): PhaseUpdate | null {
  const set: Fields = {};
  const from: Fields = {};
  for (const k of Object.keys(want) as (keyof Fields)[]) {
    if (want[k] !== row[k]) {
      (set as Record<string, unknown>)[k] = want[k];
      (from as Record<string, unknown>)[k] = row[k];
    }
  }
  return Object.keys(set).length ? { id: row.id, phase_number: row.phase_number, set, from } : null;
}

/**
 * targetPhase: make this phase the single `active` one (earlier → bypassed, later → planned, completed/skipped untouched).
 * completePhase: mark this phase `completed` on the day the next phase actually started (Saginaw D3).
 * Updates are ordered demotions first, target last — the partial unique index allows one `active` row per project.
 */
export function planPhaseSync(rows: PhaseRow[], opts: { targetPhase?: number; completePhase?: number }): PhaseSyncPlan {
  const ordered = inProgrammeOrder(rows);
  const updates: PhaseUpdate[] = [];
  const state: StateUpsert[] = [];

  if (opts.targetPhase !== undefined) {
    const target = ordered.find((p) => p.phase_number === opts.targetPhase);
    if (!target) throw new Error(`phase ${opts.targetPhase} not found`);
    if (isPermanentlySkipped(target.status) || target.status === "completed") throw new Error(`phase ${opts.targetPhase} is ${target.status}; refusing to activate it`);
    const targetPos = target.position ?? 0;

    for (const p of ordered) {
      if (p.id === target.id || p.status === "completed" || isPermanentlySkipped(p.status)) continue;
      const u = (p.position ?? 0) < targetPos ? diff(p, { status: "bypassed" }) : diff(p, { status: "planned", actual_start_date: null });
      if (!u) continue;
      updates.push(u);
      if (u.set.status === "planned") state.push({ phase_id: p.id, is_manual_override: false, override_note: null });
    }

    const start = target.actual_start_date ?? target.start_date;
    if (!start) throw new Error(`phase ${opts.targetPhase} has no actual_start_date or start_date`);
    const t = diff(target, { status: "active", actual_start_date: start });
    if (t) {
      updates.push(t);
      state.push({ phase_id: target.id, is_manual_override: true, override_note: OVERRIDE_NOTE });
    }
  }

  if (opts.completePhase !== undefined) {
    const idx = ordered.findIndex((p) => p.phase_number === opts.completePhase);
    if (idx < 0) throw new Error(`phase ${opts.completePhase} not found`);
    const next = ordered.slice(idx + 1).find((p) => p.actual_start_date);
    if (!next) throw new Error(`no later phase has started; cannot date phase ${opts.completePhase}'s completion`);
    const u = diff(ordered[idx], { status: "completed", actual_completed_date: next.actual_start_date });
    if (u) updates.push(u);
  }

  return { updates, state };
}
