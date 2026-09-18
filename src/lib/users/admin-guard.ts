import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

// Task 378 — shared authorization for admin/super_admin-only user-management routes.
//
// /simplify pass, round 2: originally one `requireUserAdmin(targetId, { blockSelf,
// blockSuperAdminTarget })` function with two boolean flags. Split into three composable
// pieces once a 3rd call site landed and showed 3 of the 4 possible flag combinations already
// in active use (route.ts: neither; deactivate: both; reactivate: only the second) — that's
// the combinatorial-growth signal a flags object is the wrong shape for, not a hypothetical
// one. Each route now reads exactly which checks it opts into instead of two anonymous
// booleans plus prose explaining why each caller opts out of each one independently.

/** Base check: is there an authenticated caller, and are they admin or super_admin? */
export type AdminGuardResult =
  | { ok: true; callerId: string; callerRole: string }
  | { ok: false; response: NextResponse };

export async function requireAdmin(): Promise<AdminGuardResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: callerProfile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const callerRole = callerProfile?.role;
  if (callerRole !== "admin" && callerRole !== "super_admin") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true, callerId: user.id, callerRole };
}

/**
 * Rejects a caller acting on their own account. Without it an admin can deactivate themselves
 * and lock themselves out of the only page that could undo it. route.ts's role/department/
 * unlock edits never blocked self-service, so it doesn't call this at all.
 */
export function blockSelfTarget(callerId: string, targetUserId: string): NextResponse | null {
  if (callerId === targetUserId) {
    return NextResponse.json({ error: "You can't deactivate your own account." }, { status: 403 });
  }
  return null;
}

/**
 * Rejects a non-super_admin caller whose target's CURRENT role is super_admin. A blanket rule
 * — route.ts keeps its own narrower, per-field versions instead of this (the role-select's
 * "can't assign super_admin" and the unlock button's "unlock requires super_admin"), so it
 * doesn't call this either; only deactivate/reactivate need "may not touch a Super Admin at
 * all" as a single check.
 */
export async function requireNotSuperAdminTarget(
  callerRole: string,
  targetUserId: string
): Promise<NextResponse | null> {
  if (callerRole === "super_admin") return null;

  const { data: target } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", targetUserId)
    .maybeSingle();
  if (target?.role === "super_admin") {
    return NextResponse.json(
      { error: "Only a Super Admin can change a Super Admin's account status." },
      { status: 403 }
    );
  }
  return null;
}
