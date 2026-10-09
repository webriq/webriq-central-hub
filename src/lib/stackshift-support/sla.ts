import { adminClient } from "@/lib/supabase/admin";
import { addHours, resolveHours } from "./sla-logic";

// Task 444 — due date from the admin-editable support_sla_config. Falls back to the in-code defaults
// when the table is missing (pre-migration 169), unreadable, or has no valid row for the priority.
export async function computeDueAt(priority: string | null | undefined, from: Date = new Date()): Promise<Date> {
  let config: Record<string, number> | null = null;
  try {
    const { data, error } = await adminClient.from("support_sla_config").select("priority, hours");
    if (!error && data) config = Object.fromEntries(data.map((r) => [r.priority, Number(r.hours)]));
  } catch {
    // fall through to defaults
  }
  return addHours(from, resolveHours(priority, config));
}
