// Task 455 — pure rules for programme delay notes (per phase + per project) and the kickoff date
// editor. No DB/env imports, so Client Components and `pnpm check:logic` can both use it.
//
// PMs are deliberately unrestricted (task 291: pm is not membership-gated anywhere). Marketing keeps
// the note access it had before this task.

export const DELAY_NOTE_MAX_LENGTH = 1000;

const NOTE_WRITE_ROLES = ["admin", "super_admin", "marketing", "pm"];
const KICKOFF_WRITE_ROLES = ["admin", "super_admin", "pm"];

export function canWriteDelayNotes(role: string | null | undefined): boolean {
  return !!role && NOTE_WRITE_ROLES.includes(role);
}

export function canEditKickoff(role: string | null | undefined): boolean {
  return !!role && KICKOFF_WRITE_ROLES.includes(role);
}

// Trims; empty/whitespace/non-string clears the note (null).
export function parseDelayNote(raw: unknown): { ok: true; note: string | null } | { ok: false; error: string } {
  const note = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  if (note && note.length > DELAY_NOTE_MAX_LENGTH) {
    return { ok: false, error: `Note must be ${DELAY_NOTE_MAX_LENGTH} characters or fewer` };
  }
  return { ok: true, note };
}

// A kickoff is stored at noon UTC so the calendar date is the same in Manila (UTC+8) and the US —
// currentDisplayDay() diffs local midnights, so this makes the kickoff Day 1 in every timezone.
export function kickoffTimestamp(ymd: string): string {
  return `${ymd}T12:00:00.000Z`;
}

export function parseKickoffDate(raw: unknown, todayYmd: string): { ok: true; ymd: string } | { ok: false; error: string } {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false, error: "kickoff_date must be YYYY-MM-DD" };
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) return { ok: false, error: "kickoff_date is not a real date" };
  if (raw > todayYmd) return { ok: false, error: "Kickoff date cannot be in the future" };
  return { ok: true, ymd: raw };
}
