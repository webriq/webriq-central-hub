// Task 434 — Phase 1 onboarding-checklist items are `tasks` rows with `kind = 'checklist'` and must never show up in a task listing or a
// task count. Every such query is written as `run(exclude)` and applies `.eq("kind", "task")` when `exclude` is true. Until migration 163
// adds the column, that filter fails with Postgres 42703 (undefined_column); the query is then re-run unfiltered — nothing to exclude yet —
// so a deployment that gets ahead of the migration degrades instead of breaking every task list.
type QueryResult = { error: { code?: string; message?: string } | null };

const UNDEFINED_COLUMN = "42703";

export async function excludingChecklist<R extends QueryResult>(run: (exclude: boolean) => PromiseLike<R>): Promise<R> {
  const filtered = await run(true);
  if (filtered.error?.code === UNDEFINED_COLUMN && /\bkind\b/.test(filtered.error.message ?? "")) return run(false);
  return filtered;
}
