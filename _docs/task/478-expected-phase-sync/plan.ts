// Task 478 — pure planner: move a programme to the PM tracker's *Expected* phase (the calendar phase
// for its current day). Every earlier phase becomes `completed` (never skipped/bypassed), dated on the
// 120-day calendar: started on its Day-start date, completed on its Day-end date (capped at today).
// The target becomes `active`, started on its own Day-start date; later phases go back to `planned`.
import { PROGRAMME_PHASES } from "../../../src/config/customer-phases";
import { inProgrammeOrder, type PhaseStatus } from "../../../src/lib/programme/programme-status";

export type PhaseRow = {
  id: string;
  phase_number: number | null;
  position: number | null;
  status: PhaseStatus;
  actual_start_date: string | null;
  actual_completed_date: string | null;
};

type Fields = Partial<Pick<PhaseRow, "status" | "actual_start_date" | "actual_completed_date">>;
export type PhaseUpdate = { id: string; phase_number: number | null; set: Fields; from: Fields };
export type StateUpsert = { phase_id: string; is_manual_override: boolean; override_note: string | null };
export type PhaseSyncPlan = { updates: PhaseUpdate[]; state: StateUpsert[] };

export const OVERRIDE_NOTE = "Task 478: aligned to PM tracker Expected phase (Nov 17)";

/** YYYY-MM-DD of programme day `day` (Day 1 = kickoff). Pure calendar arithmetic, no timezone. */
export function dayToYmd(kickoffYmd: string, day: number): string {
  const [y, m, d] = kickoffYmd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + day - 1)).toISOString().slice(0, 10);
}

/** Programme day of `todayYmd` (Day 1 = kickoff), uncapped. */
export function dayOf(kickoffYmd: string, todayYmd: string): number {
  const ms = (s: string) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((ms(todayYmd) - ms(kickoffYmd)) / 86_400_000) + 1;
}

/** The calendar phase for a programme day (Days 1–15 Onboard … 91–120 Optimize). */
export function expectedPhaseFor(day: number): number {
  const p = PROGRAMME_PHASES.find((ph) => day >= ph.dayStart && day <= ph.dayEnd);
  if (!p) throw new Error(`day ${day} is outside the 120-day calendar`);
  return p.number;
}

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
 * Updates are ordered: every non-target row first, target last — the partial unique index allows only
 * one `active` programme phase per project, so the old active row must be demoted before the target is promoted.
 * Already-`completed` earlier phases keep their real dates. Refuses custom phases (only the 5 defaults are calendar-mapped).
 */
export function planExpectedPhase(rows: PhaseRow[], opts: { kickoffYmd: string; targetPhase: number; todayYmd: string }): PhaseSyncPlan {
  const ordered = inProgrammeOrder(rows);
  const numbers = ordered.map((r) => r.phase_number);
  if (numbers.join(",") !== "1,2,3,4,5") throw new Error(`expected phases 1–5 in order, found ${numbers.join(",")}`);

  const cfg = (n: number) => PROGRAMME_PHASES.find((p) => p.number === n)!;
  const capToday = (ymd: string) => (ymd > opts.todayYmd ? opts.todayYmd : ymd);
  const updates: PhaseUpdate[] = [];
  const state: StateUpsert[] = [];
  let targetUpdate: PhaseUpdate | null = null;

  for (const p of ordered) {
    const n = p.phase_number!;
    const c = cfg(n);
    if (n < opts.targetPhase) {
      if (p.status === "completed") continue;
      const u = diff(p, {
        status: "completed",
        actual_start_date: dayToYmd(opts.kickoffYmd, c.dayStart),
        actual_completed_date: capToday(dayToYmd(opts.kickoffYmd, c.dayEnd)),
      });
      if (u) updates.push(u);
    } else if (n === opts.targetPhase) {
      if (p.status === "completed") throw new Error(`phase ${n} is already completed; refusing to re-activate it`);
      targetUpdate = diff(p, { status: "active", actual_start_date: dayToYmd(opts.kickoffYmd, c.dayStart), actual_completed_date: null });
      state.push({ phase_id: p.id, is_manual_override: true, override_note: OVERRIDE_NOTE });
    } else {
      if (p.status === "completed") throw new Error(`later phase ${n} is completed; refusing to reopen it`);
      const u = diff(p, { status: "planned", actual_start_date: null, actual_completed_date: null });
      if (u) {
        updates.push(u);
        state.push({ phase_id: p.id, is_manual_override: false, override_note: null });
      }
    }
  }
  if (targetUpdate) updates.push(targetUpdate);
  return { updates, state: targetUpdate || updates.length ? state : [] };
}
