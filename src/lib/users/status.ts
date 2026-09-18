import { adminClient } from "@/lib/supabase/admin";

// Task 378 — pure "is this hub user active" read predicates, split out of deactivate.ts in a
// /simplify pass. deactivate.ts is a side-effecting lifecycle orchestrator (ban, force-logout,
// membership deletion); these are read-only queries consumed by callers that have nothing to
// do with performing a deactivation — postLoginGate's login gate and the assignee-picker
// filter in src/lib/members/assignable.ts. Mirrors this codebase's existing read/action split
// convention: src/lib/auth/role-access.ts ("route permission table, no side effects") versus
// src/lib/auth/require-role.ts (the guard that acts on it).

/**
 * True unless this user's `hub_users` row is explicitly `status = 'inactive'`. Used by
 * `postLoginGate` as defense-in-depth behind the GoTrue ban.
 *
 * Fails OPEN (returns true) on a lookup error or a missing row — a `profiles` row with no
 * `hub_users` counterpart (the dead migration-026 trigger, see task 365) must not be treated
 * as deactivated, and a transient DB error must not lock someone out of a login gate.
 */
export async function isHubUserActive(userId: string): Promise<boolean> {
  const { data, error } = await adminClient
    .from("hub_users")
    .select("status")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[isHubUserActive] lookup failed — treating as active:", error.message);
    return true;
  }
  return data?.status !== "inactive";
}

/**
 * Every user id currently marked `hub_users.status = 'inactive'`. Deliberately unscoped by
 * caller-supplied ids — `hub_users` is a small internal-staff table (the same assumption
 * `GET /api/v2/users` already makes with its own unscoped, unpaginated select), so this stays
 * cheap without needing the caller's id list first. That's what lets `getAssignableMembers()`
 * run this fully in parallel with its `profiles` query instead of gating it behind one.
 * Revisit with `.range()` pagination (CLAUDE.md's 1000-row rule) if this table ever approaches
 * that size.
 *
 * Fails OPEN — a lookup error returns an empty set, so a caller degrades to "nobody is known
 * to be inactive" rather than failing entirely.
 */
export async function getInactiveHubUserIds(): Promise<Set<string>> {
  const { data, error } = await adminClient.from("hub_users").select("id").eq("status", "inactive");
  if (error) {
    console.error("[getInactiveHubUserIds] lookup failed — treating as none:", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.id));
}
