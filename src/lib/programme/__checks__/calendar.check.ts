import { PROGRAMME_PHASES, resolveEffectivePhase } from "@/config/customer-phases";
import {
  asCompressedDay as C, asDisplayDay as D, asReferenceDay as R,
  createProgrammeCalendar, dateToDisplayDay, displayDayToDate, currentDisplayDay, phaseAtDisplayDay, referenceSpansOf,
} from "@/lib/programme/calendar";
import { assert, type Check } from "./_harness";

const phases = PROGRAMME_PHASES.map((p, i) => ({ number: p.number, sortOrder: i, dayStart: p.dayStart, dayEnd: p.dayEnd }));
const cal = (durationDays: number, skipPhaseNumbers: number[] = []) => createProgrammeCalendar({ durationDays, skipPhaseNumbers, phases });
const refs = [1, 15, 16, 30, 31, 60, 61, 120];

// Golden values captured from the pre-refactor primitives (compressReferenceDay → scaleDay), so a
// regression in the composition order fails loudly. "15→0" (a day inside a skipped phase) is
// intentional: a skipped phase occupies no columns and is never rendered.
const GOLDEN: [string, number, number[], number, number, number[]][] = [
  // name, duration, skipped, totalCompressed, totalDisplay, display values for `refs`
  ["default 120, nothing skipped", 120, [], 120, 120, [1, 15, 16, 30, 31, 60, 61, 120]],
  ["120, Phase 1 skipped", 120, [1], 105, 105, [1, 0, 1, 15, 16, 45, 46, 105]],
  ["120, Phases 1+2 skipped", 120, [1, 2], 90, 90, [1, 0, 1, 0, 1, 30, 31, 90]],
  ["60-day programme", 60, [], 120, 60, [1, 8, 8, 15, 16, 30, 31, 60]],
  ["60-day, Phase 1 skipped", 60, [1], 105, 53, [1, 1, 1, 8, 8, 23, 23, 53]],
];

export const checks: Check[] = [
  ...GOLDEN.map(([name, dur, skip, totC, totD, display]): Check => [`calendar golden: ${name}`, () => {
    const c = cal(dur, skip);
    assert.equal(c.totalDays.compressed, totC);
    assert.equal(c.totalDays.display, totD);
    assert.deepEqual(refs.map((d) => c.referenceToDisplay(R(d))), display);
  }]),

  ["compressPhases leaves skipped rows untouched and compresses the rest (+ deliverables)", () => {
    const c = cal(120, [1]);
    const input = PROGRAMME_PHASES.map((p, i) => ({ ...p, sortOrder: i }));
    const out = c.compressPhases(input);
    assert.deepEqual(out[0], input[0]);                                  // skipped Phase 1 as-is
    assert.equal(out[1].dayStart, 1);                                    // Phase 2: 16 → 1
    assert.equal(out[1].dayEnd, 15);
    assert.equal(out[1].deliverables[0].dayStart, input[1].deliverables[0].dayStart - 15);
  }],

  ["toDisplayPhases scales every phase and deliverable (identity at 120 days)", () => {
    const id = cal(120);
    const input = PROGRAMME_PHASES.map((p, i) => ({ ...p, sortOrder: i }));
    assert.deepEqual(id.toDisplayPhases(input), input);
    const half = cal(60).toDisplayPhases(input);
    assert.equal(half[2].dayStart, 16);                                  // 31 → 16
    assert.equal(half[2].dayEnd, 30);                                    // 60 → 30
  }],

  ["display → compressed → display round-trips for every day of a 60-day programme", () => {
    const c = cal(60);
    for (let d = 1; d <= 60; d++) assert.equal(c.compressedToDisplay(c.displayToCompressed(D(d))), d, `day ${d}`);
  }],

  ["backdateOffsetDays: whole days to backdate so today lands on the phase's first day", () => {
    assert.deepEqual([1, 2, 3, 4, 5].map((n) => cal(120).backdateOffsetDays(n)), [0, 15, 30, 60, 90]);
    assert.deepEqual([1, 2, 3, 4, 5].map((n) => cal(120, [1]).backdateOffsetDays(n)), [0, 0, 15, 45, 75]);
    assert.deepEqual([1, 2, 3, 4, 5].map((n) => cal(60).backdateOffsetDays(n)), [0, 7, 15, 30, 45]);
  }],

  ["phaseAtDisplayDay maps a real day through the reference axis", () => {
    assert.equal(phaseAtDisplayDay(5, 120).number, 1);
    assert.equal(phaseAtDisplayDay(20, 120).number, 2);
    assert.equal(phaseAtDisplayDay(30, 60).number, 3);                   // 30 of 60 → reference 60 → Phase 3
    assert.equal(phaseAtDisplayDay(500, 120).number, 5);                 // past the end → last phase
  }],

  ["displayDayToDate / dateToDisplayDay are inverse, local-midnight, DST-safe", () => {
    const start = new Date(2026, 2, 5, 15, 30);                          // Mar 5 15:30 local; a US DST change falls inside the range
    for (const day of [1, 2, 10, 11, 12, 30, 90, 120]) {
      const date = displayDayToDate(start, D(day));
      assert.equal(date.getHours(), 0, `day ${day} should be local midnight`);
      assert.equal(dateToDisplayDay(start, date), day, `round-trip day ${day}`);
    }
    assert.equal(displayDayToDate(start, D(1)).getDate(), 5);            // Day 1 = the start date's own calendar date
    assert.equal(dateToDisplayDay(start, new Date(2026, 2, 4)), 0);      // before the start is below 1 (not floored)
  }],

  ["currentDisplayDay: Day 1 on the start date, floored at 1, optional clamp", () => {
    assert.equal(currentDisplayDay(new Date(), 120), 1);
    assert.equal(currentDisplayDay(new Date(Date.now() + 5 * 86_400_000)), 1);          // started in the future → 1
    const old = new Date(Date.now() - 400 * 86_400_000);
    assert.ok(currentDisplayDay(old) > 120);                                             // unclamped can exceed the length
    assert.equal(currentDisplayDay(old, 120), 120);                                      // clamped
  }],

  // ── Task 432: stored overrides are already skip-compressed; only static defaults are compressed ──
  // Baoase's real shape: Phase 2 permanently skipped; Phase 3/4/5 carry plan overrides on the compressed scale.
  ...(() => {
    const row = (phase_number: number, start: number | null, end: number | null) => ({ phase_number, custom_name: null, day_start_override: start, day_end_override: end, sort_order: phase_number });
    const deliv = (key: string, start: number | null, end: number | null) => ({ deliverable_key: key, custom_name: null, custom_description: null, custom_owner: null, day_start_override: start, day_end_override: end });
    const baoase = () => [
      resolveEffectivePhase(row(1, null, null), []),
      resolveEffectivePhase(row(2, null, null), []),
      resolveEffectivePhase(row(3, 16, 45), [deliv("product-publishing", 16, 45), deliv("industry-publishing", 26, 30), deliv("location-publishing", 31, 35)]),
      resolveEffectivePhase(row(4, 46, 75), [deliv("updated-publishing-plan", 46, 60), deliv("ai-visibility-tracking", 61, 75)]),
      resolveEffectivePhase(row(5, 76, 120), [deliv("updated-publishing-plan", 76, 120)]),
    ];
    const baoaseCal = () => { const r = baoase(); return { r, c: createProgrammeCalendar({ durationDays: 120, skipPhaseNumbers: [2], phases: referenceSpansOf(r) }) }; };
    const days = (p: { dayStart: number; dayEnd: number }) => [p.dayStart, p.dayEnd];
    return [
      ["referenceSpansOf: default phases use their static span; overrides are ignored", () => {
        const spans = referenceSpansOf(baoase());
        assert.deepEqual(spans.map((p) => [p.number, p.dayStart, p.dayEnd]), [[1, 1, 15], [2, 16, 30], [3, 31, 60], [4, 61, 90], [5, 91, 120]]);
      }],
      ["referenceSpansOf: a custom phase (no static counterpart) keeps its own span", () => {
        const custom = resolveEffectivePhase(row(6, 121, 135), []);
        assert.deepEqual(days(referenceSpansOf([custom])[0]), [121, 135]);
      }],
      ["resolveEffectivePhase flags overridden days per field (partial override)", () => {
        const partial = resolveEffectivePhase(row(4, 46, null), []);
        assert.equal(partial.dayStartOverridden, true);
        assert.equal(partial.dayEndOverridden, false);
        assert.equal(partial.dayEnd, 90);                                           // static default kept for the other end
      }],
      ["compressPhases (skip [2]): override days are left alone, static defaults are compressed", () => {
        const { r, c } = baoaseCal();
        const out = c.compressPhases(r);
        assert.deepEqual(days(out[2]), [16, 45]);                                   // P3 override (compressed already)
        assert.deepEqual(days(out[3]), [46, 75]);                                   // P4 override
        assert.deepEqual(days(out[4]), [76, 120]);                                  // P5 override beyond the compressed total — kept, not clamped
        assert.deepEqual(days(out[0]), [1, 15]);                                    // P1 static, before the skipped span
        assert.deepEqual(days(out[1]), [16, 30]);                                   // skipped P2 left as-is
        assert.deepEqual(out[3].deliverables.map(days), [[46, 60], [61, 75]]);
      }],
      ["a phase with NO override after a skipped phase still compresses its static default", () => {
        const phasesNoOverride = [1, 2, 3, 4, 5].map((n) => resolveEffectivePhase(row(n, null, null), []));
        const c = createProgrammeCalendar({ durationDays: 120, skipPhaseNumbers: [2], phases: referenceSpansOf(phasesNoOverride) });
        assert.deepEqual(c.compressPhases(phasesNoOverride).slice(2).map(days), [[16, 45], [46, 75], [76, 105]]);
      }],
      ["Baoase's phases are contiguous and every card sits inside its phase window (0 outside)", () => {
        const { r, c } = baoaseCal();
        const display = c.toDisplayPhases(c.compressPhases(r));
        for (const p of display.filter((x) => x.number !== 2)) {
          for (const d of p.deliverables) assert.ok(d.dayStart >= p.dayStart && d.dayEnd <= p.dayEnd, `P${p.number} ${d.key} D${d.dayStart}-${d.dayEnd} vs D${p.dayStart}-${p.dayEnd}`);
        }
        assert.deepEqual([display[2], display[3], display[4]].map(days), [[16, 45], [46, 75], [76, 120]]);
      }],
      ["gridDays: extends to the latest planned day (Baoase Phase 5 → 120), never below the compressed total", () => {
        const { r, c } = baoaseCal();
        const display = c.toDisplayPhases(c.compressPhases(r));
        assert.equal(c.totalDays.display, 105);
        assert.equal(c.gridDays(display), 120);
        const plain = [1, 2, 3, 4, 5].map((n) => resolveEffectivePhase(row(n, null, null), []));
        const cp = createProgrammeCalendar({ durationDays: 120, skipPhaseNumbers: [2], phases: referenceSpansOf(plain) });
        assert.equal(cp.gridDays(cp.toDisplayPhases(cp.compressPhases(plain))), 105);               // no override → compressed total
        const id = createProgrammeCalendar({ durationDays: 120, phases: referenceSpansOf(plain) });
        assert.equal(id.gridDays(id.toDisplayPhases(id.compressPhases(plain))), 120);                // nothing skipped → 120
      }],
      ["gridDays ignores permanently skipped phases (their static spans never widen the grid)", () => {
        const plain = [1, 2, 3, 4, 5].map((n) => resolveEffectivePhase(row(n, null, null), []));
        const cp = createProgrammeCalendar({ durationDays: 120, skipPhaseNumbers: [5], phases: referenceSpansOf(plain) });
        assert.equal(cp.gridDays(cp.toDisplayPhases(cp.compressPhases(plain))), 90);                 // Phase 5 skipped: 120 − 30
      }],
      ["no permanent skip: overridden and static values behave identically (compression is the identity)", () => {
        const withOverride = [resolveEffectivePhase(row(2, 20, 28), [deliv("tech-docs", 20, 22)])];
        const c = createProgrammeCalendar({ durationDays: 120, skipPhaseNumbers: [], phases: referenceSpansOf(withOverride) });
        const out = c.compressPhases(withOverride)[0];
        assert.deepEqual([days(out), days(out.deliverables[0])], [[20, 28], [20, 22]]);
      }],
    ] as Check[];
  })(),

  ["branded scales are plain numbers at runtime", () => {
    assert.equal(R(3) + C(4) + D(5), 12);
  }],
];
