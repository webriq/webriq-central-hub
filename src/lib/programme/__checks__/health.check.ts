import { deliverableHealth as health, progressPercentage as pct } from "@/lib/programme/deliverable-health";
import { assert, type Check } from "./_harness";

const h = (dayStart: number, dayEnd: number, currentDay: number, percentage: number) => health({ dayStart, dayEnd, currentDay, percentage });

export const checks: Check[] = [
  ["health: done wins over dates", () => assert.equal(h(1, 3, 9, 100), "done")],
  ["health: overdue once the end day has passed", () => assert.equal(h(1, 3, 4, 0), "overdue")],
  ["health: due today / within 2 days is due-soon, 3 days out is ok", () => {
    assert.equal(h(1, 4, 4, 0), "due-soon");
    assert.equal(h(1, 6, 4, 10), "due-soon");
    assert.equal(h(1, 7, 4, 10), "ok");
  }],
  ["health: not started yet is upcoming; a single-day item today is due-soon", () => {
    assert.equal(h(9, 12, 4, 0), "upcoming");
    assert.equal(h(4, 4, 4, 0), "due-soon");
  }],
  ["progressPercentage: checklist share, else coarse status", () => {
    assert.equal(pct("pending", ["done", "pending", "done", "pending"]), 50);
    assert.equal(pct("in_progress", []), 50);
    assert.equal(pct("done", []), 100);
    assert.equal(pct("pending", []), 0);
  }],
];
