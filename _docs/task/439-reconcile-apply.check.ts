// Task 439 — integration-style check of loadReconciledTimer() against an in-memory fake Supabase
// client: concurrent reconciles must append events once (optimistic updated_at token).
// Run: npx tsx _docs/task/439-reconcile-apply.check.ts
import assert from "node:assert/strict";
import { loadReconciledTimer } from "../../src/lib/timer/reconcile-apply";

type Row = Record<string, unknown>;
const T0 = Date.now() - 100 * 60_000;
let row: Row | null = {
  id: "r1", user_id: "u1", task_id: "t1", issue_id: null, project_id: "p1", status: "paused",
  accumulated_seconds: 600, segment_started_at: null, break_type: "meal",
  break_started_at: new Date(T0).toISOString(), break_duration_minutes: 60,
  timeline: [{ type: "started", at: new Date(T0 - 600_000).toISOString() }, { type: "break_start", at: new Date(T0).toISOString(), break_type: "meal" }],
  updated_at: "2026-10-08T09:00:00.000000+00:00",
};
const closed: unknown[] = [];

function table(name: string) {
  const filters: Record<string, unknown> = {};
  let mode: "select" | "update" | "delete" = "select";
  let patch: Row = {};
  const api = {
    select: () => api,
    update: (p: Row) => { mode = "update"; patch = p; return api; },
    delete: () => { mode = "delete"; return api; },
    eq: (k: string, v: unknown) => { filters[k] = v; return api; },
    is: () => api,
    maybeSingle: async () => run(),
    single: async () => run(),
    then: (res: (v: unknown) => void) => run().then(res),
  };
  async function run() {
    await Promise.resolve(); // yield so concurrent callers interleave
    if (name === "timer_breaks") { closed.push(patch); return { data: null, error: null }; }
    const match = row && Object.entries(filters).every(([k, v]) => row![k] === v);
    if (mode === "select") return { data: match ? { ...row } : null, error: null };
    if (!match) return { data: mode === "delete" ? [] : null, error: null };
    if (mode === "update") { row = { ...row!, ...patch }; return { data: { ...row }, error: null }; }
    const gone = row; row = null; return { data: [gone], error: null };
  }
  return api;
}
const supabase = { from: (n: string) => table(n) } as never;

(async () => {
  const [a, b] = await Promise.all([loadReconciledTimer(supabase, "u1"), loadReconciledTimer(supabase, "u1")]);
  const events = (row!.timeline as { type: string }[]).map((e) => e.type);
  assert.deepEqual(events, ["started", "break_start", "break_end", "resumed"], "events appended exactly once");
  assert.equal(row!.status, "running");
  assert.equal(row!.break_type, null);
  assert.equal(closed.length, 1, "break record closed once");
  assert.equal((a as Row).status, "running");
  assert.equal((b as Row).status, "running");
  console.log("439 reconcile-apply: concurrency check passed");
})();
