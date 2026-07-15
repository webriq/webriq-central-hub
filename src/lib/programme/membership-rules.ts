// Task 153 — pure membership permission logic, safe to import from Client Components (no
// adminClient / server-only dependency). DB-mutation helpers live in phase-membership.ts,
// which re-exports everything here alongside the adminClient-backed write functions for
// server-side callers.

export type MembershipRole = "admin" | "hr" | "pm" | "developer" | "client" | "super_admin" | "marketing";

// Roles exempt from both project- and phase-level membership gating entirely.
const ALWAYS_ALLOWED_ROLES: MembershipRole[] = ["admin", "super_admin"];

// Roles the two gates actually apply to — everyone else (developer/hr/client) is untouched by
// this task, per the user's confirmed scope.
const GATED_ROLES: MembershipRole[] = ["marketing", "pm"];

export function isRoleExemptFromMembership(role: string | null): boolean {
  return !!role && (ALWAYS_ALLOWED_ROLES as string[]).includes(role);
}

export function isRoleGatedByMembership(role: string | null): boolean {
  return !!role && (GATED_ROLES as string[]).includes(role);
}

// Task 157 (supersedes task 155's membership-gated check): "Add Collaborators" is now
// super_admin/admin/pm, or the project creator — role-based only, no "must already be a member"
// precondition, and marketing dropped from this specific action per the user's latest, explicit
// role list ("Only Super Admin/Admin/PM/creator itself can do this"). This is a real walk-back
// of task 155's tightening, called out explicitly since marketing had creator/collaborator
// rights in every earlier round of this feature.
export function canManageProjectMembers(role: string | null, isCreator: boolean): boolean {
  if (isCreator) return true;
  return role === "super_admin" || role === "admin" || role === "pm";
}

// Task 157: "Set Project Owner" is a narrower, more sensitive action than adding collaborators
// — super_admin/admin, or the project creator. No pm/marketing.
export function canSetProjectOwner(role: string | null, isCreator: boolean): boolean {
  if (isCreator) return true;
  return role === "super_admin" || role === "admin";
}

// Requirements 2/3: super_admin (extended to admin, matching this codebase's consistent
// admin+super_admin pairing convention elsewhere — flagged as an assumption in the task doc),
// any current Phase 1 member with role marketing ("assigned marketing agent"), or the Phase 1
// owner directly (covers the edge case where an admin/super_admin started onboarding
// themselves, so the owner isn't a marketing user).
export function canManagePhase1Membership(
  role: string | null,
  membership: { isMember: boolean; isOwner: boolean } | null
): boolean {
  if (role === "admin" || role === "super_admin") return true;
  if (!membership?.isMember) return false;
  return membership.isOwner || role === "marketing";
}
