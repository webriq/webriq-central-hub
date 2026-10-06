import {
  defaultDeliverableSpan, deliverableSpanError, hasDuplicateName, nextDeliverablePosition, slugifyDeliverableKey, uniqueDeliverableKey,
} from "@/lib/programme/add-deliverable";
import { assert, type Check } from "./_harness";

// Task 433 — pure helpers behind POST .../programme/deliverables.
export const checks: Check[] = [
  ["slug lower-cases and collapses punctuation", () => {
    assert.equal(slugifyDeliverableKey("  Final QA Pass! "), "final-qa-pass");
    assert.equal(slugifyDeliverableKey("!!!"), "deliverable");
  }],
  ["unique key suffixes until free, ignoring null keys", () => {
    assert.equal(uniqueDeliverableKey("Extra", ["other", null]), "extra");
    assert.equal(uniqueDeliverableKey("Extra", ["extra"]), "extra-2");
    assert.equal(uniqueDeliverableKey("Extra", ["extra", "extra-2"]), "extra-3");
  }],
  ["next position is one past the max (0 when empty, nulls ignored)", () => {
    assert.equal(nextDeliverablePosition([]), 0);
    assert.equal(nextDeliverablePosition([0, null, 4, 2]), 5);
  }],
  ["duplicate name is case/whitespace-insensitive", () => {
    assert.equal(hasDuplicateName(" kickoff ", ["Kickoff"]), true);
    assert.equal(hasDuplicateName("Kick", ["Kickoff"]), false);
  }],
  ["default span is the phase's last day", () => {
    assert.deepEqual(defaultDeliverableSpan(30), { dayStart: 30, dayEnd: 30 });
  }],
  ["span validation: ints, order, phase bounds", () => {
    assert.equal(deliverableSpanError(16, 30, 16, 30), null);
    assert.ok(deliverableSpanError(1.5, 3, 1, 5));
    assert.ok(deliverableSpanError(5, 3, 1, 5));
    assert.ok(deliverableSpanError(0, 3, 1, 5));
    assert.ok(deliverableSpanError(2, 6, 1, 5));
  }],
];
