import { adminClient } from "@/lib/supabase/admin";

// Task 378 — deactivate/reactivate a Hub user: the side-effecting lifecycle orchestrator.
// Pure "is this user active" read predicates live in ./status.ts instead (split out in a
// /simplify pass once callers unrelated to performing a deactivation — postLoginGate,
// the assignee picker — started depending on them; mirrors this codebase's existing
// role-access.ts/require-role.ts read-vs-action split).
//
// Deactivation is strictly SOFT: the auth.users row, the profiles row and the hub_users row
// all survive. That is deliberate and load-bearing — hub_users.id and profiles.id both FK to
// auth.users(id) ON DELETE CASCADE (migration 007), and every attribution column in the app
// (tasks.assignee_id/assignees, task_comments.author_id, issue_comments.author_id,
// time_logs.employee_id, notes.created_by, projects.created_by, …) resolves a display name
// through profiles. Deleting the auth user would cascade all of it away. A deactivated user
// must keep their name on everything they did, so we ban rather than delete.
//
// server-only: uses adminClient (service role). Import from route handlers only.

// GoTrue has no "ban forever" sentinel, so a large finite duration is the documented idiom
// (~100 years). Reactivation must pass "none" explicitly — omitting ban_duration on an
// updateUserById call leaves any existing ban untouched.
const BAN_FOREVER = "876000h";

export interface DeactivationImpact {
  projectMemberships: number;
  phaseMemberships: number;
  /** is_owner rows — removing these leaves the project/phase with no owner. */
  ownedProjects: number;
  ownedPhases: number;
}

export type DeactivateResult =
  | { ok: true; impact: DeactivationImpact; sessionsCleared: boolean }
  | { ok: false; error: string };

/**
 * Counts what deactivating this user would remove. Read-only — safe to call from the
 * confirmation dialog's pre-flight GET.
 */
export async function getDeactivationImpact(userId: string): Promise<DeactivationImpact> {
  const [projects, phases, ownedProjects, ownedPhases] = await Promise.all([
    adminClient.from("project_members").select("id", { count: "exact", head: true }).eq("user_id", userId),
    adminClient.from("phase_members").select("id", { count: "exact", head: true }).eq("user_id", userId),
    adminClient.from("project_members").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("is_owner", true),
    adminClient.from("phase_members").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("is_owner", true),
  ]);

  return {
    projectMemberships: projects.count ?? 0,
    phaseMemberships: phases.count ?? 0,
    ownedProjects: ownedProjects.count ?? 0,
    ownedPhases: ownedPhases.count ?? 0,
  };
}

/**
 * Ban → force-logout → drop memberships → flag inactive.
 *
 * The order is fail-closed on purpose: the ban lands first, so if any later step errors the
 * user is already locked out rather than removed-from-everything-but-still-able-to-log-in.
 * hub_users.status is written LAST so the row only reads "Inactive" once the rest succeeded.
 *
 * Idempotent — re-running against an already-deactivated user re-bans, deletes nothing, and
 * leaves status as "inactive".
 */
export async function deactivateUser(userId: string): Promise<DeactivateResult> {
  // 1. Ban at the GoTrue layer. This is the real enforcement: it blocks email/password
  //    sign-in, the Zoho OAuth callback (which never reaches postLoginGate) and invite /
  //    recovery links alike, without each path needing its own check.
  const { error: banError } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: BAN_FOREVER,
  });
  if (banError) return { ok: false, error: banError.message };

  // 2. Terminate live sessions. Non-fatal: migration 144 may not be applied yet, and the ban
  //    from step 1 has already landed — without this the only exposure is the remainder of an
  //    existing access token's TTL, which is strictly better than aborting a half-done change.
  //
  //    force_logout_user is absent from the generated Database["public"]["Functions"] map
  //    until `supabase gen types` is re-run, so the client is cast here — same untyped-RPC
  //    escape hatch (and reasoning) as the `db` alias in src/app/(auth)/actions.ts.
  let sessionsCleared = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: rpcError } = await (adminClient as any).rpc("force_logout_user", {
    target_user_id: userId,
  });
  if (rpcError) {
    console.error("[deactivateUser] force_logout_user RPC failed:", rpcError.message);
    sessionsCleared = false;
  }

  // 3+4. Snapshot the impact BEFORE removing anything, then atomically drop both membership
  //      tables and flip hub_users.status in one transaction via migration 145's function —
  //      no attribution column is ever read or written here, only the two membership tables
  //      and hub_users.status. Falls back to the original sequential writes (each checked
  //      individually) if the RPC errors, e.g. migration 145 not yet applied — same shape as
  //      step 2's non-fatal force_logout_user call.
  const impact = await getDeactivationImpact(userId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: finalizeError } = await (adminClient as any).rpc("deactivate_user_memberships", {
    target_user_id: userId,
  });

  if (finalizeError) {
    console.error(
      "[deactivateUser] deactivate_user_memberships RPC failed — falling back to non-atomic sequence (migration 145 may not be applied yet):",
      finalizeError.message
    );

    const [phaseDelete, projectDelete] = await Promise.all([
      adminClient.from("phase_members").delete().eq("user_id", userId),
      adminClient.from("project_members").delete().eq("user_id", userId),
    ]);
    if (phaseDelete.error) return { ok: false, error: phaseDelete.error.message };
    if (projectDelete.error) return { ok: false, error: projectDelete.error.message };

    const { error: statusError } = await adminClient
      .from("hub_users")
      .update({ status: "inactive" })
      .eq("id", userId);
    if (statusError) return { ok: false, error: statusError.message };
  }

  return { ok: true, impact, sessionsCleared };
}

/**
 * Lifts the ban and flags the user active again. Memberships are NOT restored — those rows
 * were deleted and there is nothing to restore them from; the confirmation dialog says so.
 */
export async function reactivateUser(userId: string): Promise<{ ok: boolean; error?: string }> {
  const { error: banError } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });
  if (banError) return { ok: false, error: banError.message };

  const { error: statusError } = await adminClient
    .from("hub_users")
    .update({ status: "active" })
    .eq("id", userId);
  if (statusError) return { ok: false, error: statusError.message };

  return { ok: true };
}
