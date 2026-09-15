import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Task 351 — tickets went multi-assignee (`issues.assignees uuid[]`, migration 132) but the
// legacy scalar columns `assignee_id` / `assignee_name` / `assignee_email` are kept in sync so
// the Zoho export and any not-yet-migrated display path keep working. `assignee_id` mirrors
// `assignees[0]`; `assignee_name` is that profile's name; `assignee_email` is always cleared
// (this selector never sets a free-text email).
//
// Task 364 renamed "Issue" to "Ticket" everywhere at the application layer — still operates on
// the `issues` DB table (unchanged), just under `src/lib/tickets/` now.

export type TicketAssigneeSyncColumns = {
  assignees: string[];
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_email: null;
};

export async function buildTicketAssigneeSync(
  supabase: SupabaseClient<Database>,
  assignees: unknown,
): Promise<TicketAssigneeSyncColumns> {
  const ids = Array.isArray(assignees) ? [...new Set(assignees.map((v) => String(v)).filter(Boolean))] : [];
  const primary = ids[0] ?? null;

  let name: string | null = null;
  if (primary) {
    const { data } = await supabase.from("profiles").select("full_name").eq("id", primary).maybeSingle();
    name = data?.full_name ?? null;
  }

  return { assignees: ids, assignee_id: primary, assignee_name: name, assignee_email: null };
}
