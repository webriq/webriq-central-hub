import {
  PROGRAMME_PHASES,
  DEFAULT_PROGRAMME_DAYS,
  compressReferenceDay,
  getCurrentProgrammeDay,
  getPhaseForDay,
  resolveEffectiveStartDay,
  scaleDay,
  unscaleDay,
  type PhaseConfig,
  type PhaseDayRangeEntry,
} from "@/config/customer-phases";

// Task 425 — the single place a StackShift programme "day" changes scale. Three scales exist and
// were previously converted by hand at every call site (a wrong order silently misplaces a bar):
//
//   reference  — the static 1–120 axis in PROGRAMME_PHASES (and a project's stored day_*_override
//                values, which live on this same axis)
//   compressed — reference with every skipped phase's span removed (task 244: a skipped phase
//                occupies no calendar days)
//   display    — compressed, scaled to the project's real `programme_duration_days` (task 253);
//                this is the scale "today" (`currentDisplayDay`) and every on-screen column use
//
// The brands make mixing scales a compile error. This module only *composes* the primitives in
// `@/config/customer-phases` (scaleDay / unscaleDay / compressReferenceDay …) — their behaviour is
// unchanged; call sites must go through here instead of composing them.

export type ReferenceDay = number & { readonly __scale: "reference" };
export type CompressedDay = number & { readonly __scale: "compressed" };
export type DisplayDay = number & { readonly __scale: "display" };

export const asReferenceDay = (n: number) => n as ReferenceDay;
export const asCompressedDay = (n: number) => n as CompressedDay;
export const asDisplayDay = (n: number) => n as DisplayDay;

const MS_PER_DAY = 86_400_000;

const localMidnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// ─── Standalone helpers (no phase list needed) ───────────────────────────────────────────────

/**
 * Today's programme day on the display scale (Day 1 = the start date, floor 1). Pass
 * `durationDays` to clamp to the project's programme length (the listing/report callers do);
 * omit it for the unclamped value (Timeline, where "today" past the end means overdue).
 */
export function currentDisplayDay(startedAt: string | Date, durationDays?: number): DisplayDay {
  const day = getCurrentProgrammeDay(startedAt);
  return asDisplayDay(durationDays === undefined ? day : Math.min(durationDays, day));
}

/** The phase a display-scale day falls in on the static reference axis (falls back to the last phase). */
export function phaseAtDisplayDay(day: number, durationDays: number = DEFAULT_PROGRAMME_DAYS): PhaseConfig {
  return getPhaseForDay(unscaleDay(day, durationDays));
}

/** Calendar date (local midnight) of a display-scale day: Day 1 = the start date's own calendar date. */
export function displayDayToDate(startedAt: string | Date, day: DisplayDay): Date {
  const start = localMidnight(new Date(startedAt));
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + (day - 1));
}

/** `displayDayToDate` as a `YYYY-MM-DD` string (the format of the date columns); local calendar date, no timezone shift. */
export function displayDayToYmd(startedAt: string | Date, day: DisplayDay): string {
  const d = displayDayToDate(startedAt, day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Inverse of `displayDayToDate`. Not floored: a date before the start gives a day below 1. */
export function dateToDisplayDay(startedAt: string | Date, date: Date): DisplayDay {
  const diff = (localMidnight(date).getTime() - localMidnight(new Date(startedAt)).getTime()) / MS_PER_DAY;
  return asDisplayDay(Math.round(diff) + 1);
}

// ─── Per-project calendar ────────────────────────────────────────────────────────────────────

// Task 432: `*Overridden` marks a day that came from a stored override — already on the compressed scale.
type DayRanged = { dayStart: number; dayEnd: number; dayStartOverridden?: boolean; dayEndOverridden?: boolean };
type PhaseWithDeliverables = DayRanged & { number: number; deliverables: DayRanged[] };

/**
 * The phase list `compressReferenceDay` needs: every default phase at its **static reference span**
 * (stored overrides are compressed-scale and would distort the skipped-span arithmetic), custom
 * phases (no static counterpart) as given. Pass this — not the raw resolved phases — as `phases`
 * when the calendar will compress resolved (possibly overridden) phases.
 */
export function referenceSpansOf<P extends PhaseDayRangeEntry>(resolved: P[]): PhaseDayRangeEntry[] {
  return resolved.map((p) => {
    const staticPhase = PROGRAMME_PHASES.find((s) => s.number === p.number);
    return { number: p.number, sortOrder: p.sortOrder, dayStart: staticPhase?.dayStart ?? p.dayStart, dayEnd: staticPhase?.dayEnd ?? p.dayEnd };
  });
}

export interface ProgrammeCalendar {
  readonly durationDays: number;
  readonly skipPhaseNumbers: readonly number[];
  referenceToCompressed(day: ReferenceDay): CompressedDay;
  compressedToDisplay(day: CompressedDay): DisplayDay;
  referenceToDisplay(day: ReferenceDay): DisplayDay;
  /** Inverse of `compressedToDisplay` — what a display-scale edit is stored as (`day_*_override`). */
  displayToCompressed(day: DisplayDay): CompressedDay;
  /** The grid's column count: the reference total with skipped spans removed, on both scales. */
  readonly totalDays: { compressed: CompressedDay; display: DisplayDay };
  /** Whole days `programme_started_at` is backdated by so "today" lands on `effectivePhaseNumber`'s first day. */
  backdateOffsetDays(effectivePhaseNumber: number): number;
  /**
   * Skip-compress phases + their deliverables (a skipped phase's own row is left as-is, as before).
   * Task 432: a day flagged `dayStartOverridden`/`dayEndOverridden` came from a stored override and is
   * already compressed, so it is left alone — only static defaults are compressed.
   */
  compressPhases<P extends PhaseWithDeliverables>(phases: P[]): P[];
  /** Scale already-compressed phases + deliverables onto the display axis. */
  toDisplayPhases<P extends PhaseWithDeliverables>(compressed: P[]): P[];
  /**
   * Timeline grid columns: the compressed programme total, extended to the latest planned day when a
   * plan runs past it (e.g. a plan that keeps the programme at 120 days after skipping a phase), so
   * every planned card has date headers. Permanently skipped phases are ignored.
   */
  gridDays(displayPhases: PhaseWithDeliverables[]): DisplayDay;
}

/**
 * `phases` is the project's *uncompressed* ordered phase list (reference-scale day ranges, e.g.
 * `resolveEffectivePhase` output). `skipPhaseNumbers` is the permanent exclusion list
 * (`projects.draft_skip_phase_numbers`) — not the time-bypass `skipped` status.
 */
export function createProgrammeCalendar({
  durationDays = DEFAULT_PROGRAMME_DAYS,
  skipPhaseNumbers = [],
  phases = [],
}: {
  durationDays?: number;
  skipPhaseNumbers?: number[];
  phases?: PhaseDayRangeEntry[];
} = {}): ProgrammeCalendar {
  const referenceToCompressed = (d: ReferenceDay) => asCompressedDay(compressReferenceDay(d, phases, skipPhaseNumbers));
  const compressedToDisplay = (d: CompressedDay) => asDisplayDay(scaleDay(d, durationDays));
  const displayToCompressed = (d: DisplayDay) => asCompressedDay(unscaleDay(d, durationDays));
  const skipped = new Set(skipPhaseNumbers);
  const totalDays = (() => {
    const compressed = referenceToCompressed(asReferenceDay(DEFAULT_PROGRAMME_DAYS));
    return { compressed, display: compressedToDisplay(compressed) };
  })();

  // `skipOverridden`: leave days flagged as stored overrides untouched (the compress step); the
  // scale-to-display step applies to every day.
  const mapRanges = <P extends PhaseWithDeliverables>(phase: P, f: (d: number) => number, skipOverridden = false): P => {
    const day = (value: number, overridden?: boolean) => (skipOverridden && overridden ? value : f(value));
    return {
      ...phase,
      dayStart: day(phase.dayStart, phase.dayStartOverridden),
      dayEnd: day(phase.dayEnd, phase.dayEndOverridden),
      deliverables: phase.deliverables.map((d) => ({ ...d, dayStart: day(d.dayStart, d.dayStartOverridden), dayEnd: day(d.dayEnd, d.dayEndOverridden) })),
    };
  };

  return {
    durationDays,
    skipPhaseNumbers,
    referenceToCompressed,
    compressedToDisplay,
    referenceToDisplay: (d) => compressedToDisplay(referenceToCompressed(d)),
    displayToCompressed,
    totalDays,
    backdateOffsetDays: (effectivePhaseNumber) =>
      scaleDay(resolveEffectiveStartDay(phases, effectivePhaseNumber, skipPhaseNumbers), durationDays) - 1,
    compressPhases: (list) =>
      list.map((p) => (skipped.has(p.number) ? p : mapRanges(p, (d) => referenceToCompressed(asReferenceDay(d)), true))),
    toDisplayPhases: (list) => list.map((p) => mapRanges(p, (d) => compressedToDisplay(asCompressedDay(d)))),
    gridDays: (displayPhases) =>
      asDisplayDay(
        displayPhases
          .filter((p) => !skipped.has(p.number))
          .reduce<number>((max, p) => Math.max(max, p.dayEnd, ...p.deliverables.map((d) => d.dayEnd)), totalDays.display)
      ),
  };
}
