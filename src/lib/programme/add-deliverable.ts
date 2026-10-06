// Task 433 — pure helpers for adding a deliverable to an already-started programme phase (no I/O; exercised by add-deliverable.check.ts).

export const MAX_DELIVERABLE_NAME_LENGTH = 120;

/** `Final QA Pass!` → `final-qa-pass`; falls back to `deliverable` when nothing slug-able remains. */
export function slugifyDeliverableKey(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "deliverable";
}

/** The slug of `name`, suffixed `-2`, `-3`… until free among the phase's existing keys (the unique index is per phase — migration 161). */
export function uniqueDeliverableKey(name: string, existingKeys: Iterable<string | null>): string {
  const taken = new Set([...existingKeys].filter((k): k is string => !!k));
  const base = slugifyDeliverableKey(name);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Next `position` in a phase: one past the highest existing, 0 for an empty phase. */
export function nextDeliverablePosition(positions: Iterable<number | null>): number {
  let max = -1;
  for (const p of positions) if (p != null && p > max) max = p;
  return max + 1;
}

/** Case-insensitive duplicate-name test against the phase's existing deliverable names. */
export function hasDuplicateName(name: string, existingNames: Iterable<string>): boolean {
  const target = name.trim().toLowerCase();
  for (const n of existingNames) if (n.trim().toLowerCase() === target) return true;
  return false;
}

/** Default span when the caller gives no days: a one-day deliverable on the phase's last display day. */
export function defaultDeliverableSpan(phaseDayEnd: number): { dayStart: number; dayEnd: number } {
  return { dayStart: phaseDayEnd, dayEnd: phaseDayEnd };
}

/** Error message for an invalid explicit span, or null when it fits inside the phase's stored display window. */
export function deliverableSpanError(dayStart: number, dayEnd: number, phaseDayStart: number, phaseDayEnd: number): string | null {
  if (!Number.isInteger(dayStart) || !Number.isInteger(dayEnd)) return "day_start and day_end must be integers";
  if (dayStart > dayEnd) return "day_start must be less than or equal to day_end";
  if (dayStart < phaseDayStart || dayEnd > phaseDayEnd) return `day_start/day_end must fall within the phase's range (${phaseDayStart}-${phaseDayEnd})`;
  return null;
}
