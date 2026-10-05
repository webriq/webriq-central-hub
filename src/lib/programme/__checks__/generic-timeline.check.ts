import { buildTimeline, currentPhaseByDate } from "@/lib/programme/generic-timeline";
import type { Database } from "@/types/database";
import { assert, type Check } from "./_harness";

type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
const ms = (over: Partial<Milestone>): Milestone => ({
  id: "m1", project_id: "p", external_id: null, name: "Phase", description: null, start_date: null, due_date: null,
  status: "planned", position: 0, day_start: null, day_end: null, created_by: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  ...over,
} as Milestone);
const started = "2026-10-05T09:00:00Z";

export const checks: Check[] = [
  ["buildTimeline: Sep 23 → Oct 14 on Oct 5 is 22 days, Day 13 (task 420's acceptance numbers)", () => {
    const t = buildTimeline([ms({ start_date: "2026-09-23", due_date: "2026-10-14" })], started, new Date(2026, 9, 5));
    assert.equal(t.totalDays, 22);
    assert.equal(t.currentDay, 13);
  }],
  ["buildTimeline: before the window starts the day is below 1; after it ends it exceeds the total", () => {
    const m = [ms({ start_date: "2026-09-23", due_date: "2026-10-14" })];
    assert.ok(buildTimeline(m, started, new Date(2026, 8, 1)).currentDay < 1);
    const late = buildTimeline(m, started, new Date(2026, 9, 20));
    assert.ok(late.currentDay > late.totalDays);
  }],
  ["buildTimeline: day_start/day_end fallback when a milestone has no dates", () => {
    const t = buildTimeline([ms({ day_start: 1, day_end: 60 })], started, new Date(2026, 9, 5));
    assert.equal(t.totalDays, 60);
    assert.equal(t.currentDay, 1);
  }],
  ["buildTimeline: a milestone with neither dates nor days is excluded as undated", () => {
    const t = buildTimeline([ms({ id: "dated", start_date: "2026-10-01", due_date: "2026-10-10" }), ms({ id: "none" })], started, new Date(2026, 9, 5));
    assert.equal(t.undated.length, 1);
    assert.equal(t.undated[0].id, "none");
  }],
  ["currentPhaseByDate: picks the phase whose window contains today", () => {
    const a = ms({ id: "a", start_date: "2026-09-01", due_date: "2026-09-30" });
    const b = ms({ id: "b", start_date: "2026-10-01", due_date: "2026-10-31" });
    const t = buildTimeline([a, b], started, new Date(2026, 9, 5));
    assert.equal(currentPhaseByDate([a, b], t)?.id, "b");
  }],
];
