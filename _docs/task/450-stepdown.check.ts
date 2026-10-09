// Task 450 — assertions for the Desk step-down logic (no test runner in this repo).
// Run: npx tsx _docs/task/450-stepdown.check.ts
import assert from "node:assert/strict";
import {
  reconcileDecision, isRetired, parseSiteList, shouldNotifyCustomer, shouldAlertMiss, planPair, applySql, rollbackSql,
  type ReconcileInput, type CleanupRow,
} from "../../src/lib/stackshift-support/stepdown-logic";

// 1. reconcile decision matrix: dormant unless BOTH the switch and the site sign-off are on
const on: ReconcileInput = { enabled: true, siteSignedOff: true, hasDeskRow: false, deskRowRetired: false, hasDirectTwin: false };
const all = (over: Partial<ReconcileInput>) => reconcileDecision({ ...on, ...over });
for (const hasDeskRow of [false, true]) {
  for (const hasDirectTwin of [false, true]) {
    assert.equal(all({ enabled: false, hasDeskRow, hasDirectTwin }), "ingest", "switch off => today's behaviour, whatever else is true");
    assert.equal(all({ siteSignedOff: false, hasDeskRow, hasDirectTwin }), "ingest", "no sign-off (or revoked) => today's behaviour");
    assert.equal(all({ enabled: false, siteSignedOff: false, hasDeskRow, hasDirectTwin }), "ingest");
  }
}
assert.equal(all({}), "miss", "unknown to the Hub => a MISS, never an import");
assert.equal(all({ hasDirectTwin: true }), "skip_direct", "the direct row already is the record");
assert.equal(all({ hasDeskRow: true }), "refresh", "in-flight Desk tickets keep syncing (D5)");
assert.equal(all({ hasDeskRow: true, hasDirectTwin: true }), "refresh");
assert.equal(all({ hasDeskRow: true, deskRowRetired: true }), "skip_retired", "retired copies are no longer refreshed");
assert.equal(all({ hasDeskRow: true, deskRowRetired: true, hasDirectTwin: true }), "skip_retired");
// no input combination under reconcile mode ever returns "ingest" for an unknown ticket
assert.notEqual(all({ hasDeskRow: false }), "ingest");

assert.equal(isRetired({ retiredInto: { inboxId: "x" } }), true);
assert.equal(isRetired({ retiredInto: "x" }), false);
assert.equal(isRetired(null), false);
assert.equal(isRetired({}), false);

// 2. customer emails need request opt-in AND an active sign-off AND operator opt-in (global or per site)
const n = (over: Partial<Parameters<typeof shouldNotifyCustomer>[0]>) =>
  shouldNotifyCustomer({ globalFlag: undefined, sitesCsv: undefined, site: "acme", siteSignedOff: true, suppress: false, ...over });
assert.equal(n({}), false, "nothing configured => silent");
assert.equal(n({ globalFlag: "true" }), true);
assert.equal(n({ globalFlag: "true", siteSignedOff: false }), false, "no sign-off => never, even with the global flag");
assert.equal(n({ globalFlag: "true", suppress: true }), false, "StackShift still sending its own => never");
assert.equal(n({ sitesCsv: "acme,other" }), true);
assert.equal(n({ sitesCsv: " ACME ,other" }), true, "case/whitespace insensitive");
assert.equal(n({ sitesCsv: "other" }), false);
assert.equal(n({ sitesCsv: "*" }), true);
assert.equal(n({ sitesCsv: "*", siteSignedOff: false }), false);
assert.equal(n({ sitesCsv: "acme", site: null }), false);
assert.equal(n({ globalFlag: "false", sitesCsv: "" }), false);
assert.deepEqual([...parseSiteList(" A , b ,,")], ["a", "b"]);

// 3. miss alert cooldown
const NOW = Date.parse("2026-10-09T12:00:00Z");
assert.equal(shouldAlertMiss(null, NOW), true);
assert.equal(shouldAlertMiss("2026-10-09T01:00:00Z", NOW), false);
assert.equal(shouldAlertMiss("2026-10-08T11:00:00Z", NOW), true);
assert.equal(shouldAlertMiss("junk", NOW), true);

// 4. cleanup planning: additive, never overwrites, idempotent, reversible
const NOW_ISO = "2026-10-09T12:00:00.000Z";
const desk: CleanupRow = {
  id: "11111111-1111-1111-1111-111111111111", ticket_number: 100, status: "open", sla_due_at: "2026-10-10T00:00:00Z",
  source_meta: { ticketNumber: "21466", status: "Open", cf: { cf_white_label: "Quandary" }, stackShiftSite: "acme", whiteLabel: "Quandary", webUrl: "https://desk/x", it: "O'Brien" },
};
const direct: CleanupRow = { id: "22222222-2222-2222-2222-222222222222", ticket_number: 200, status: "open", sla_due_at: null, source_meta: { source: "stackshift-direct" } };
const plan = planPair(desk, direct, NOW_ISO);
assert.equal(plan.skipReason, undefined);
assert.equal(plan.directPatch.stackShiftSite, "acme");
assert.equal(plan.directPatch.whiteLabel, "Quandary");
assert.deepEqual((plan.directPatch.fromDesk as { cf: unknown }).cf, { cf_white_label: "Quandary" });
assert.equal((plan.directPatch.fromDesk as { slaDueAt: string }).slaDueAt, "2026-10-10T00:00:00Z");
assert.deepEqual(plan.deskPatch, { retiredInto: { inboxId: direct.id, ticketNumber: 200, at: NOW_ISO } });
// existing keys on the direct row are never overwritten
const withOwn = planPair(desk, { ...direct, source_meta: { stackShiftSite: "keep-me", whiteLabel: "mine" } }, NOW_ISO);
assert.equal("stackShiftSite" in withOwn.directPatch, false);
assert.equal("whiteLabel" in withOwn.directPatch, false);
assert.ok("fromDesk" in withOwn.directPatch);
// nothing to copy => no top-level keys beyond fromDesk
assert.deepEqual(Object.keys(planPair({ ...desk, source_meta: {} }, direct, NOW_ISO).directPatch), ["fromDesk"]);
// already-retired / already-copied pairs are skipped or no-ops
assert.ok(planPair({ ...desk, source_meta: { retiredInto: { inboxId: "x" } } }, direct, NOW_ISO).skipReason);
assert.ok(planPair(desk, { ...direct, source_meta: { retiredInto: { inboxId: "x" } } }, NOW_ISO).skipReason);
assert.equal("fromDesk" in planPair(desk, { ...direct, source_meta: { fromDesk: {} } }, NOW_ISO).directPatch, false, "second run does not recopy");

// 5. SQL: guarded, escaped, additive; rollback removes exactly what apply added; skipped pairs emit nothing
const sql = applySql([plan]);
assert.match(sql, /\|\| '\{.*\}'::jsonb where id = '2222/);
assert.match(sql, /not \(coalesce\(source_meta, '\{\}'::jsonb\) \? 'fromDesk'\)/);
assert.match(sql, /not \(coalesce\(source_meta, '\{\}'::jsonb\) \? 'retiredInto'\)/);
assert.equal(sql.split("\n").length, 2);
assert.ok(!/delete\s|drop\s|truncate/i.test(sql), "never deletes");
const rb = rollbackSql([plan]);
assert.match(rb, / - 'stackShiftSite' - 'whiteLabel' - 'fromDesk' where id = '2222/);
assert.match(rb, /source_meta - 'retiredInto' where id = '1111/);
assert.equal(applySql([{ ...plan, skipReason: "x" }]), "");
assert.equal(rollbackSql([{ ...plan, skipReason: "x" }]), "");
const quoted = applySql([planPair({ ...desk, source_meta: { ...desk.source_meta, whiteLabel: "O'Brien Co" } }, direct, NOW_ISO)]);
assert.ok(quoted.includes("O''Brien Co"));

console.log("450 step-down checks: all passed");
