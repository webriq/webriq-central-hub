// Shared role vocabulary between /api/v2/users/[userId] (role changes on existing
// users) and /api/admin/hub-users/invite (creating + inviting a brand-new user) —
// extracted (task 365) so both routes stay in sync on what a "role" means.

export const VALID_ROLES = ["admin", "super_admin", "hr", "pm", "developer", "client", "other"] as const;
export type ValidRole = (typeof VALID_ROLES)[number];

// hub_users.role — display string
export const ROLE_DISPLAY: Record<ValidRole, string> = {
  admin: "Admin",
  super_admin: "Super Admin",
  hr: "HR",
  pm: "PM",
  developer: "Developer",
  client: "Client",
  other: "Other",
};

// profiles.role — auth enum. "other" maps to "client" (closest enum value for non-standard roles)
export const PROFILE_ROLE: Record<ValidRole, "admin" | "super_admin" | "hr" | "pm" | "developer" | "client"> = {
  admin: "admin",
  super_admin: "super_admin",
  hr: "hr",
  pm: "pm",
  developer: "developer",
  client: "client",
  other: "client",
};
