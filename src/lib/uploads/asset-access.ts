// Task 419 — the OR-combined role/user permission rule shared by customer_assets and
// customer_asset_folders (task 138/144), extracted from file-url/route.ts so the single-file URL
// route and the bulk download-manifest route can't drift. allowed_user_ids is an additive grant
// on top of allowed_roles; admin/super_admin always pass; no restriction on either = everyone.
export function canAccessAsset(
  role: string | null,
  userId: string,
  allowedRoles: string[] | null,
  allowedUserIds: string[] | null,
): boolean {
  if (role === "admin" || role === "super_admin") return true;
  const noRoleRestriction = !allowedRoles || allowedRoles.length === 0;
  const noUserRestriction = !allowedUserIds || allowedUserIds.length === 0;
  if (noRoleRestriction && noUserRestriction) return true;
  const roleMatches = !noRoleRestriction && !!role && allowedRoles.includes(role);
  const userMatches = !noUserRestriction && allowedUserIds.includes(userId);
  return roleMatches || userMatches;
}
