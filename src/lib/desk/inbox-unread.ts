// Task 490 — Desk Inbox unread indicator. `inbox.unread_count` (migration 186) is incremented by a DB trigger for every
// recent customer message and reset when any staff member opens the thread (shared, team-wide read state). Until the
// migration is applied, anything naming the new columns fails with Postgres 42703 and callers degrade to "no unread".
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { excludingDeleted } from "@/lib/desk/inbox-deleted";

const UNDEFINED_COLUMN = "42703";

export function isMissingUnreadColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === UNDEFINED_COLUMN && /\b(unread_count|seen_at|seen_by|last_client_message_at)\b/.test(error.message ?? "");
}

// The Inbox's default view excludes the imported Zoho archive (task 331): a row is "not archived" when
// source_meta.isArchived is absent or not "true". Shared with `desk/inbox/page.tsx`.
export const NOT_ARCHIVED_OR = "source_meta->>isArchived.is.null,source_meta->>isArchived.neq.true";

export type UnreadCount = { count: number; supported: boolean };

// Threads with new customer messages that the default Inbox view would show: not archived, not retired (task 450),
// not soft-deleted (task 489, when its migration is applied). Counts threads, not messages.
export async function countUnreadThreads(client: SupabaseClient<Database>): Promise<UnreadCount> {
  const { count, error } = await excludingDeleted((exclude) => {
    // Not `head: true`: a HEAD response carries no body, so a PostgREST error arrives with an empty code and
    // message and the 42703 fallbacks (here and in `excludingDeleted`) can't recognise a missing column — the
    // route then 500s with "count failed: " instead of degrading. A GET capped at one row keeps the error body.
    const q = client
      .from("inbox")
      .select("id", { count: "exact" })
      .gt("unread_count", 0)
      .or(NOT_ARCHIVED_OR)
      .is("source_meta->retiredInto", null)
      .limit(1);
    return exclude ? q.is("deleted_at", null) : q;
  });
  if (isMissingUnreadColumn(error)) return { count: 0, supported: false };
  if (error) throw new Error(error.message);
  return { count: count ?? 0, supported: true };
}
