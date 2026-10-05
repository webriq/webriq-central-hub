import { assignTracks, clampDragToPhase } from "@/app/(hub)/projects/v2/[projectId]/_gantt-shared";
import { assert, type Check } from "./_harness";

export const checks: Check[] = [
  ["assignTracks: non-overlapping items share track 0", () => {
    assert.deepEqual(assignTracks([{ dayStart: 1, dayEnd: 3 }, { dayStart: 4, dayEnd: 6 }, { dayStart: 7, dayEnd: 7 }]), [0, 0, 0]);
  }],
  ["assignTracks: overlaps go to the first free track, reusing it after it frees", () => {
    assert.deepEqual(assignTracks([{ dayStart: 1, dayEnd: 5 }, { dayStart: 3, dayEnd: 8 }, { dayStart: 6, dayEnd: 9 }]), [0, 1, 0]);
  }],
  ["assignTracks: touching ranges (end === next start) overlap", () => {
    assert.deepEqual(assignTracks([{ dayStart: 1, dayEnd: 4 }, { dayStart: 4, dayEnd: 6 }]), [0, 1]);
  }],
  ["assignTracks: empty", () => assert.deepEqual(assignTracks([]), [])],

  ["clampDragToPhase move: shifts within the phase, preserving span", () => {
    assert.deepEqual(clampDragToPhase("move", 10, 12, 1, 30), { dayStart: 10, dayEnd: 12 });
    assert.deepEqual(clampDragToPhase("move", -3, -1, 1, 30), { dayStart: 1, dayEnd: 3 });      // pinned to phase start
    assert.deepEqual(clampDragToPhase("move", 29, 33, 1, 30), { dayStart: 26, dayEnd: 30 });    // pinned to phase end
  }],
  ["clampDragToPhase resize-left/right never inverts or leaves the phase", () => {
    assert.deepEqual(clampDragToPhase("resize-left", 0, 10, 1, 30), { dayStart: 1, dayEnd: 10 });
    assert.deepEqual(clampDragToPhase("resize-left", 14, 10, 1, 30), { dayStart: 10, dayEnd: 10 });   // dragged past the end
    assert.deepEqual(clampDragToPhase("resize-right", 5, 40, 1, 30), { dayStart: 5, dayEnd: 30 });
    assert.deepEqual(clampDragToPhase("resize-right", 5, 2, 1, 30), { dayStart: 5, dayEnd: 5 });      // dragged before the start
  }],
];
