import { adminClient } from "@/lib/supabase/admin";

/**
 * Returns the `hr_employees.id` for a profile, creating the row on first use.
 * Uses adminClient deliberately: staff have no insert policy on hr_employees (RLS is read-own),
 * and the row is pure bookkeeping that `leave_requests.employee_id` must reference. Migration 164
 * backfills existing profiles, so this only fires for users created afterwards.
 */
export async function ensureEmployee(profileId: string, fullName: string | null): Promise<string | null> {
  const db = adminClient;
  const found = await db.from("hr_employees").select("id").eq("profile_id", profileId).maybeSingle();
  if (found.data) return found.data.id;

  const inserted = await db
    .from("hr_employees")
    .insert({
      profile_id: profileId,
      full_name: fullName?.trim() || "Unnamed user",
      employment_type: "full_time",
      status: "active",
    })
    .select("id")
    .single();
  if (inserted.data) return inserted.data.id;

  // Lost a race with a concurrent request — read the winner's row.
  const retry = await db.from("hr_employees").select("id").eq("profile_id", profileId).maybeSingle();
  return retry.data?.id ?? null;
}
