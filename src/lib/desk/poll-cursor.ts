// Pure cursor/overlap/time-budget decisions shared by the cron pollers (task 441) — kept free of
// I/O so _docs/task/441-poll-cursor.check.ts can exercise them via `npx tsx`.

// Re-scan this far behind the cursor so a ticket that became searchable late (index lag, or a
// custom field set by a follow-up update) is not stranded behind a cursor that already moved on.
export const POLL_OVERLAP_MS = 15 * 60_000;

export type PollCandidate = { id: string; modifiedMs: number };

// Rows modified after the cursor are always work. Rows inside the overlap window (at or before
// the cursor) are work only when the Hub has never ingested them (`knownIds`), so the overlap
// doesn't re-sync every recent ticket on every run. Returned oldest-first so the cursor can
// advance incrementally.
export function selectCandidates(rows: PollCandidate[], cursorMs: number, knownIds: Set<string>): PollCandidate[] {
  return rows
    .filter((r) => r.modifiedMs > cursorMs || !knownIds.has(r.id))
    .sort((a, b) => a.modifiedMs - b.modifiedMs);
}

// The cursor only ever moves forward, and only to a ticket that was actually handled.
export function advanceCursor(cursorMs: number, handledModifiedMs: number): number {
  return handledModifiedMs > cursorMs ? handledModifiedMs : cursorMs;
}

export function budgetExhausted(startedAtMs: number, nowMs: number, budgetMs: number): boolean {
  return nowMs - startedAtMs >= budgetMs;
}
