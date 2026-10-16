import {
  DELAY_NOTE_MAX_LENGTH, canEditKickoff, canWriteDelayNotes, kickoffTimestamp, parseDelayNote, parseKickoffDate,
} from "@/lib/programme/note-rules";
import { currentDisplayDay } from "@/lib/programme/calendar";
import { assert, type Check } from "./_harness";

export const checks: Check[] = [
  ["note writers: admin/super_admin/marketing/pm only", () => {
    for (const r of ["admin", "super_admin", "marketing", "pm"]) assert.equal(canWriteDelayNotes(r), true, r);
    for (const r of ["developer", "hr", "client", null, undefined, ""]) assert.equal(canWriteDelayNotes(r), false, String(r));
  }],
  ["kickoff editors: admin/super_admin/pm only (not marketing)", () => {
    for (const r of ["admin", "super_admin", "pm"]) assert.equal(canEditKickoff(r), true, r);
    for (const r of ["marketing", "developer", "hr", "client", null]) assert.equal(canEditKickoff(r), false, String(r));
  }],
  ["parseDelayNote trims, clears on empty, caps length", () => {
    assert.deepEqual(parseDelayNote("  waiting on client  "), { ok: true, note: "waiting on client" });
    assert.deepEqual(parseDelayNote("   "), { ok: true, note: null });
    assert.deepEqual(parseDelayNote(null), { ok: true, note: null });
    assert.deepEqual(parseDelayNote(42), { ok: true, note: null });
    assert.equal(parseDelayNote("x".repeat(DELAY_NOTE_MAX_LENGTH)).ok, true);
    assert.equal(parseDelayNote("x".repeat(DELAY_NOTE_MAX_LENGTH + 1)).ok, false);
  }],
  ["parseKickoffDate validates format, real dates and not-in-future", () => {
    assert.deepEqual(parseKickoffDate("2026-06-23", "2026-10-16"), { ok: true, ymd: "2026-06-23" });
    assert.deepEqual(parseKickoffDate("2026-10-16", "2026-10-16"), { ok: true, ymd: "2026-10-16" });
    assert.equal(parseKickoffDate("2026-10-17", "2026-10-16").ok, false);
    assert.equal(parseKickoffDate("2026-02-30", "2026-10-16").ok, false);
    assert.equal(parseKickoffDate("23-06-2026", "2026-10-16").ok, false);
    assert.equal(parseKickoffDate(undefined, "2026-10-16").ok, false);
  }],
  ["kickoff at noon UTC is Day 1 on the kickoff date", () => {
    assert.equal(kickoffTimestamp("2026-06-23"), "2026-06-23T12:00:00.000Z");
    // A kickoff of today's UTC date must read as Day 1 (noon UTC is the same calendar day from UTC-11 to UTC+11).
    const todayUtc = new Date().toISOString().slice(0, 10);
    assert.equal(currentDisplayDay(kickoffTimestamp(todayUtc)), 1);
  }],
];
