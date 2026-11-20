// Task 489 — Desk Inbox soft delete. `inbox.deleted_at` (migration 185) hides a thread from every Hub listing; only the
// Inbox's "Deleted" view shows it. Readers are written as `run(exclude)` and apply `.is("deleted_at", null)` when
// `exclude` is true. Until migration 185 adds the column that filter fails with Postgres 42703 (undefined_column); the
// query is then re-run unfiltered — nothing can be deleted yet — so a deploy ahead of the migration keeps working.
// Same shape as `excludingChecklist()` (src/lib/tasks/exclude-checklist.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type QueryResult = { error: { code?: string; message?: string } | null };

const UNDEFINED_COLUMN = "42703";

export function isMissingDeletedColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === UNDEFINED_COLUMN && /\bdeleted_(at|by)\b/.test(error.message ?? "");
}

// Runs `run(true)`; on a missing-column error re-runs `run(false)`. `deletedSupported` tells the caller whether the
// column exists (the Inbox hides its "Deleted" filter option and the detail page its Delete button when it doesn't).
export async function excludingDeleted<R extends QueryResult>(
  run: (exclude: boolean) => PromiseLike<R>
): Promise<R & { deletedSupported: boolean }> {
  const filtered = await run(true);
  if (isMissingDeletedColumn(filtered.error)) return { ...(await run(false)), deletedSupported: false };
  return { ...filtered, deletedSupported: true };
}

// D4 — a new inbound customer message clears a soft delete (no-op for a live thread). The service client is passed
// in so this module stays importable anywhere. Never throws: a missing column (migration 185 not applied) or any
// other failure is logged and ignored so the pollers keep ingesting.
export async function restoreDeletedThread(client: SupabaseClient<Database>, inboxId: string): Promise<void> {
  const { error } = await client
    .from("inbox")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", inboxId)
    .not("deleted_at", "is", null);
  if (error && !isMissingDeletedColumn(error)) {
    console.warn(`[desk/inbox-deleted] restore of ${inboxId} on inbound message failed:`, error.message);
  }
}

export const DELETE_UNAVAILABLE_MESSAGE = "Thread delete is not available yet (migration 185 not applied)";
